// Admin-only online Past Paper discovery.
// Searches only Admin-approved domains, verifies PDF bytes, and imports into the existing qb_source_papers workflow.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""));

function safeHost(url: URL, domains: string[]): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
      || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return false;
  return domains.some((d) => host === d || host.endsWith("." + d));
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function htmlText(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}
function ddgTarget(href: string): string {
  try {
    const u = new URL(decodeEntities(href), "https://html.duckduckgo.com");
    const target = u.searchParams.get("uddg");
    return target || u.href;
  } catch { return ""; }
}
async function searchDomain(query: string, domain: string) {
  const q = encodeURIComponent(query + " site:" + domain);
  const res = await fetch("https://html.duckduckgo.com/html/?q=" + q, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LIBEducationPastPaperDiscovery/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("Search provider returned " + res.status + " for " + domain);
  const html = await res.text();
  const rows: Array<{ title: string; url: string; snippet: string }> = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && rows.length < 8) {
    const url = ddgTarget(m[1]);
    if (!url) continue;
    let parsed: URL;
    try { parsed = new URL(url); } catch { continue; }
    if (!safeHost(parsed, [domain])) continue;
    const after = html.slice(re.lastIndex, re.lastIndex + 1600);
    const sm = after.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[^>]+>/i);
    rows.push({ title: htmlText(m[2]).slice(0, 500) || parsed.pathname.split("/").pop() || parsed.hostname, url: parsed.href, snippet: sm ? htmlText(sm[1]).slice(0, 1200) : "" });
  }
  return rows;
}
async function fetchAllowed(urlText: string, domains: string[], accept: string) {
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error("Invalid URL."); }
  for (let hop = 0; hop <= 5; hop++) {
    if (!safeHost(url, domains)) throw new Error("URL or redirect is outside the approved source domains.");
    const res = await fetch(url.href, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LIBEducationPastPaperDiscovery/1.0)", Accept: accept },
      signal: AbortSignal.timeout(25000),
    });
    if ([301,302,303,307,308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Source returned an invalid redirect.");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new Error("Source returned HTTP " + res.status + ".");
    return { response: res, url: url.href };
  }
  throw new Error("Too many redirects.");
}
async function readBounded(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_PDF_BYTES) throw new Error("PDF exceeds the 50 MB limit.");
  if (!res.body) throw new Error("Source returned an empty response.");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PDF_BYTES) { await reader.cancel(); throw new Error("PDF exceeds the 50 MB limit."); }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(1024, bytes.length)));
  return head.includes("%PDF-");
}
async function resolvePdf(candidate: any, domains: string[]) {
  const choices = [candidate.pdf_url, candidate.source_url].filter(Boolean) as string[];
  for (const candidateUrl of choices) {
    let parsed: URL;
    try { parsed = new URL(candidateUrl); } catch { continue; }
    if (!safeHost(parsed, domains)) continue;
    const result = await fetchAllowed(parsed.href, domains, "application/pdf,application/octet-stream,text/html;q=0.8,*/*;q=0.5");
    const type = (result.response.headers.get("content-type") || "").toLowerCase();
    if (type.includes("pdf") || /\.pdf(?:$|[?#])/i.test(result.url)) return result;
    const html = await result.response.text();
    const links = [...html.matchAll(/(?:href|data-url)\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map((m) => new URL(decodeEntities(m[1]), result.url).href);
    for (const link of links) {
      const u = new URL(link);
      if (safeHost(u, domains)) {
        const pdf = await fetchAllowed(u.href, domains, "application/pdf,application/octet-stream");
        return pdf;
      }
    }
  }
  throw new Error("No accessible PDF was found on this source page.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply(500, { error: "Server configuration is incomplete." });
  const admin = createClient(supabaseUrl, serviceKey);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: "Please sign in again." });
  const { data: profile } = await admin.from("profiles").select("role,admin_name,username").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "Admin") return reply(403, { error: "Only Admin can discover and import online papers." });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const action = clip(body.action, 30);

  if (action === "search") {
    const query = clip(body.query, 400);
    const scope = body.scope === "school" ? "school" : "board";
    if (query.length < 2) return reply(400, { error: "Enter a search phrase." });
    const { data: sources, error: sourceError } = await admin.from("qb_paper_discovery_sources")
      .select("id,display_name,domain,source_type,trust_level,priority")
      .eq("enabled", true).order("priority").limit(30);
    if (sourceError) return reply(500, { error: "Could not load approved search sources." });
    const eligible = (sources || []).filter((s: any) => s.source_type === scope || s.source_type === "education_portal");
    if (!eligible.length) return reply(400, { error: "No enabled " + scope + " sources. Add an approved domain under Source management first." });
    const { data: run, error: runError } = await admin.from("qb_paper_discovery_runs")
      .insert({ query_text: query, filters: { scope }, started_by: auth.user.id }).select("id").single();
    if (runError || !run) return reply(500, { error: "Could not start the discovery run." });
    const results = await Promise.all(eligible.slice(0, 12).map(async (source: any) => {
      try { return (await searchDomain(query, source.domain)).map((r) => ({ ...r, source })); }
      catch (e) { return []; }
    }));
    const flattened = results.flat();
    const unique = new Map<string, any>();
    for (const row of flattened) if (!unique.has(row.url.toLowerCase())) unique.set(row.url.toLowerCase(), row);
    const inserts = [...unique.values()].slice(0, 80).map((r) => ({
      discovery_run_id: run.id, source_id: r.source.id, source_type: scope,
      source_domain: r.source.domain, title: r.title, source_url: r.url,
      pdf_url: /\.pdf(?:$|[?#])/i.test(r.url) ? r.url : null,
      discovered_school_name: scope === "school" ? clip(body.school_name, 200) || null : null,
      discovery_metadata: { snippet: r.snippet, trust_level: r.source.trust_level, source_name: r.source.display_name },
    }));
    let inserted = 0;
    if (inserts.length) {
      const { data, error } = await admin.from("qb_paper_discovery_candidates")
        .upsert(inserts, { onConflict: "source_url", ignoreDuplicates: true }).select("id");
      if (error) {
        await admin.from("qb_paper_discovery_runs").update({ status: "failed", error_message: error.message, completed_at: new Date().toISOString() }).eq("id", run.id);
        return reply(500, { error: "Could not save search results: " + error.message });
      }
      inserted = data?.length || 0;
    }
    await admin.from("qb_paper_discovery_runs").update({ status: "completed", results_found: flattened.length, completed_at: new Date().toISOString() }).eq("id", run.id);
    return reply(200, { run_id: run.id, found: flattened.length, new_candidates: inserted, message: "Search completed. Review candidates before importing." });
  }

  const candidateId = clip(body.candidate_id, 64);
  if (!uuid(candidateId)) return reply(400, { error: "Invalid candidate." });
  const { data: candidate, error: candidateError } = await admin.from("qb_paper_discovery_candidates").select("*").eq("id", candidateId).maybeSingle();
  if (candidateError || !candidate) return reply(404, { error: "Candidate not found." });
  const { data: sourceRows } = await admin.from("qb_paper_discovery_sources").select("domain").eq("enabled", true);
  const domains = (sourceRows || []).map((s: any) => s.domain);
  if (!domains.includes(candidate.source_domain)) return reply(400, { error: "This source is no longer enabled." });

  if (action === "verify") {
    try {
      const pdf = await resolvePdf(candidate, domains);
      const bytes = await readBounded(pdf.response);
      if (!isPdf(bytes)) {
        await admin.from("qb_paper_discovery_candidates").update({ verification_status: "invalid_pdf", status: "needs_review", updated_at: new Date().toISOString() }).eq("id", candidateId);
        return reply(422, { error: "The source did not return a valid PDF file." });
      }
      const checksum = await sha256(bytes);
      const { data: duplicate } = await admin.from("qb_source_papers").select("id").eq("checksum", checksum).maybeSingle();
      const status = duplicate ? "duplicate" : "verified";
      await admin.from("qb_paper_discovery_candidates").update({
        pdf_url: pdf.url, verification_status: status, status: duplicate ? "duplicate" : "needs_review",
        checksum, file_size_bytes: bytes.length, duplicate_of_paper_id: duplicate?.id || null, updated_at: new Date().toISOString(),
      }).eq("id", candidateId);
      return reply(200, { verified: !duplicate, duplicate: !!duplicate, pdf_url: pdf.url, checksum, file_size_bytes: bytes.length });
    } catch (e) {
      const message = clip((e as Error)?.message || e, 500);
      const status = /outside|invalid url|redirect/i.test(message) ? "unsafe_url" : "inaccessible";
      await admin.from("qb_paper_discovery_candidates").update({ verification_status: status, status: "needs_review", rejection_reason: message, updated_at: new Date().toISOString() }).eq("id", candidateId);
      return reply(422, { error: message });
    }
  }

  if (action === "import") {
    if (candidate.status !== "approved_for_import") return reply(409, { error: "Review and approve this candidate for import first." });
    const boardId = uuid(body.board_id) ? String(body.board_id) : null;
    const schoolId = uuid(body.school_id) ? String(body.school_id) : null;
    const gradeId = uuid(body.grade_id) ? String(body.grade_id) : null;
    const subject = clip(body.subject_name, 120);
    const year = Number(body.year);
    const examType = clip(body.exam_type, 40);
    const medium = clip(body.medium, 60);
    if ((boardId === null) === (schoolId === null) || !gradeId || !subject || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1 || !examType || !medium) {
      return reply(400, { error: "Choose exactly one Board or School, Class, Subject, valid Year, Exam Type and Medium." });
    }
    if (candidate.verification_status !== "verified" || !candidate.checksum || !candidate.pdf_url) return reply(400, { error: "Verify this PDF successfully before importing." });
    const { data: duplicate } = await admin.from("qb_source_papers").select("id").eq("checksum", candidate.checksum).maybeSingle();
    if (duplicate) {
      await admin.from("qb_paper_discovery_candidates").update({ status: "duplicate", duplicate_of_paper_id: duplicate.id, updated_at: new Date().toISOString() }).eq("id", candidateId);
      return reply(409, { error: "This PDF already exists in Past Papers.", duplicate_paper_id: duplicate.id });
    }
    const pdf = await fetchAllowed(candidate.pdf_url, domains, "application/pdf,application/octet-stream");
    const bytes = await readBounded(pdf.response);
    if (!isPdf(bytes)) return reply(422, { error: "The PDF content changed after verification. Verify it again." });
    const checksum = await sha256(bytes);
    if (checksum !== candidate.checksum) return reply(409, { error: "The PDF changed after verification. Verify it again." });
    const path = "source-papers/admin/discovery/" + crypto.randomUUID() + ".pdf";
    const upload = await admin.storage.from("qb-papers").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) return reply(500, { error: "Could not store the PDF: " + upload.error.message });
    const paper = {
      source_type: schoolId ? "school" : "board", board_id: boardId, school_id: schoolId,
      grade_id: gradeId, subject_name: subject, year, exam_type: examType, medium,
      source_url: candidate.source_url, stored_pdf_url: "qb-papers/" + path,
      pdf_type: "digital", download_date: new Date().toISOString().slice(0, 10),
      extraction_status: "not_started", checksum, uploaded_by: auth.user.id,
      status: "pending_review",
    };
    const { data: inserted, error: insertError } = await admin.from("qb_source_papers").insert(paper).select("id").single();
    if (insertError || !inserted) {
      await admin.storage.from("qb-papers").remove([path]);
      return reply(500, { error: "PDF stored but Past Papers registration failed: " + (insertError?.message || "unknown error") });
    }
    const { error: candidateUpdateError } = await admin.from("qb_paper_discovery_candidates").update({
      status: "imported", imported_paper_id: inserted.id, checksum, file_size_bytes: bytes.length,
      board_id: boardId, school_id: schoolId, grade_id: gradeId, subject_name: subject, year, exam_type: examType, medium,
      reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", candidateId);
    if (candidateUpdateError) {
      await admin.from("qb_source_papers").delete().eq("id", inserted.id);
      await admin.storage.from("qb-papers").remove([path]);
      return reply(500, { error: "Could not finalize the import; the temporary paper and PDF were rolled back." });
    }
    return reply(200, { imported: true, paper_id: inserted.id, status: "pending_review", message: "Imported into the existing Past Papers review workflow." });
  }

  return reply(400, { error: "Unknown action." });
});
