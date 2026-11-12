// Admin-only online Past Paper discovery.
// Board search uses Admin-approved domains; school search discovers new hosts that require Admin approval before PDF fetch.
// Verification is restricted to enabled source domains; imports use the existing qb_source_papers workflow.
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
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
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
function parseSearchResults(html: string, limit: number) {
  const rows: Array<{ title: string; url: string; snippet: string; domain: string }> = [];
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    if (rows.length >= limit) break;
    const className = anchor.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    if (!/(^|\s)result__a(\s|$)/i.test(className)) continue;
    const href = anchor.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const target = ddgTarget(href);
    if (!target) continue;
    let parsed: URL;
    try { parsed = new URL(target); } catch { continue; }
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.hostname === "html.duckduckgo.com") continue;
    const title = htmlText(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, ""));
    const tail = html.slice(html.indexOf(anchor) + anchor.length, html.indexOf(anchor) + anchor.length + 1800);
    const snippetMatch = tail.match(/class\s*=\s*["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    rows.push({
      title: title.slice(0, 500) || parsed.pathname.split("/").pop() || parsed.hostname,
      url: parsed.href,
      snippet: snippetMatch ? htmlText(snippetMatch[1]).slice(0, 1200) : "",
      domain: parsed.hostname.toLowerCase().replace(/^www\./, ""),
    });
  }
  if (!rows.length) {
    const lower = html.toLowerCase();
    const challenge = /anomaly-modal|captcha|bot detection|automated queries|unusual traffic|challenge-form|cf-chl-|verify you are human/.test(lower);
    if (challenge) throw new Error("Search provider returned a bot-check or challenge page.");
    const explicitEmpty = /no results found|no results for|class=["'][^"']*no-results|result--no-results/.test(lower);
    if (!explicitEmpty) throw new Error("Search provider returned an unrecognized page; zero results cannot be trusted.");
  }
  return rows;
}
async function searchWeb(query: string, limit = 20, domain?: string) {
  const targeted = domain ? query + " site:" + domain : query;
  const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(targeted), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error("Search provider returned HTTP " + res.status + ".");
  const html = new TextDecoder().decode(await readBounded(res, 2 * 1024 * 1024));
  return parseSearchResults(html, limit).filter((row) => !domain || row.domain === domain || row.domain.endsWith("." + domain));
}
async function searchInBatches(sources: any[], query: string, batchSize = 4) {
  const results: Array<{ title: string; url: string; snippet: string; domain: string; source: any }> = [];
  const errors: string[] = [];
  let successfulQueries = 0;
  for (let i = 0; i < sources.length; i += batchSize) {
    const batch = sources.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map(async (source: any) => {
      try {
        const rows = await searchWeb(query + " question paper PDF", 8, source.domain);
        return { source, rows, error: "" };
      } catch (e) {
        return { source, rows: [], error: source.domain + ": " + clip((e as Error)?.message || e, 220) };
      }
    }));
    for (const item of settled) {
      if (item.error) errors.push(item.error);
      else successfulQueries++;
      for (const row of item.rows) results.push({ ...row, source: item.source });
    }
  }
  return { results, errors, successfulQueries };
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
async function crawlCbseOfficial(source: any, query: string): Promise<Array<{title:string;url:string;snippet:string;domain:string;source:any}>> {
  const landing = "https://www.cbse.gov.in/cbsenew/question-paper.html";
  const { response, url } = await fetchAllowed(landing, [source.domain], "text/html,application/xhtml+xml");
  const html = new TextDecoder().decode(await readBounded(response, 2 * 1024 * 1024));
  const wanted = query.toLowerCase().replace(/cbse|question paper|previous year|past paper|pdf/g, " ").replace(/\\s+/g, " ").trim();
  const classMatch = wanted.match(/\\b(class|grade)\\s*(10|12|xii|x)\\b/);
  const wantedClass = classMatch ? (classMatch[2] === "12" || classMatch[2] === "xii" ? "xii" : "x") : "";
  const terms = wanted.replace(/\\b(class|grade)\\s*(10|12|xii|x)\\b/g, " ").split(/\\s+/).filter((x) => x.length > 1);
  const rows: Array<{title:string;url:string;snippet:string;domain:string;source:any}> = [];
  const tableRows = html.match(/<tr\\b[\\s\\S]*?<\\/tr>/gi) || [];
  let offset = 0;
  for (const row of tableRows) {
    const position = html.indexOf(row, offset);
    offset = position + row.length;
    const before = html.slice(Math.max(0, position - 50000), position);
    const headings = [...before.matchAll(/(?:Question Paper for|Question Papers for)\\s*([^<\\n]{0,160})/gi)];
    const section = headings.length ? htmlText(headings[headings.length - 1][1]) : "";
    const sectionClass = /class\\s*xii|class\\s*12/i.test(section) ? "xii" : /class\\s*x(?:\\s|$)|class\\s*10/i.test(section) ? "x" : "";
    if (wantedClass && sectionClass && wantedClass !== sectionClass) continue;
    const cells = [...row.matchAll(/<td\\b[^>]*>([\\s\\S]*?)<\\/td>/gi)];
    if (cells.length < 2) continue;
    const subject = htmlText(cells[0][1]).toUpperCase();
    if (!subject || /SUBJECT NAME|TOTAL/i.test(subject)) continue;
    if (terms.some((term) => !subject.toLowerCase().includes(term) && !section.toLowerCase().includes(term))) continue;
    const links = [...cells[1][1].matchAll(/<a\\b[^>]*href\\s*=\\s*["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi)];
    for (const link of links) {
      let pdfUrl: URL;
      try { pdfUrl = new URL(decodeEntities(link[1]), url); } catch { continue; }
      if (!safeHost(pdfUrl, [source.domain])) continue;
      rows.push({
        title: [section, subject].filter(Boolean).join(" — ").slice(0, 500),
        url: pdfUrl.href, snippet: "Official CBSE question-paper directory · " + subject,
        domain: pdfUrl.hostname.toLowerCase().replace(/^www\\./, ""), source,
      });
    }
  }
  return rows.slice(0, 60);
}
async function readBounded(res: Response, maxBytes = MAX_PDF_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error(maxBytes === MAX_PDF_BYTES ? "PDF exceeds the 50 MB limit." : "Source page exceeds the 2 MB inspection limit.");
  if (!res.body) throw new Error("Source returned an empty response.");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new Error(maxBytes === MAX_PDF_BYTES ? "PDF exceeds the 50 MB limit." : "Source page exceeds the 2 MB inspection limit."); }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return all;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
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
    const schoolName = scope === "school" ? clip(body.school_name, 200) : "";
    const searchQuery = [schoolName, query].filter(Boolean).join(" ").slice(0, 500);
    if (searchQuery.length < 2) return reply(400, { error: "Enter a search phrase." });

    const { data: sources, error: sourceError } = await admin.from("qb_paper_discovery_sources")
      .select("id,display_name,domain,source_type,trust_level,priority")
      .eq("enabled", true).order("priority").limit(200);
    if (sourceError) return reply(500, { error: "Could not load approved source registry: " + sourceError.message });
    const eligible = (sources || []).filter((s: any) => s.source_type === scope || s.source_type === "education_portal");
    const searchTargets = scope === "school"
      ? eligible.filter((s: any) => s.source_type === "school").slice(0, 16)
      : eligible.filter((s: any) => s.source_type === "board" || s.source_type === "education_portal");
    if (scope === "board" && !searchTargets.some((s: any) => s.source_type === "board")) {
      return reply(400, { error: "No enabled official board sources. Enable at least one board domain." });
    }

    const { data: run, error: runError } = await admin.from("qb_paper_discovery_runs")
      .insert({ query_text: searchQuery, filters: { scope, school_name: schoolName || null, search_mode: "targeted_domains_plus_web" }, started_by: auth.user.id }).select("id").single();
    if (runError || !run) return reply(500, { error: "Could not start the discovery run." });

    const targeted = await searchInBatches(searchTargets, searchQuery, 4);
    // CBSE's official archive is crawled directly; this path is independent of external search providers.
    const cbseSource = searchTargets.find((s: any) => s.source_type === "board" && /(^|\\.)cbse\\.gov\\.in$/i.test(s.domain));
    if (scope === "board" && cbseSource) {
      try {
        const officialRows = await crawlCbseOfficial(cbseSource, searchQuery);
        targeted.results.push(...officialRows);
        if (officialRows.length) targeted.successfulQueries++;
      } catch (e) {
        targeted.errors.push("CBSE official archive: " + clip((e as Error)?.message || e, 220));
      }
    }
    let broadResults: Array<{title:string;url:string;snippet:string;domain:string}> = [];
    let broadError = "";
    // Broad fallback is essential for newly discovered sites and domains not yet in the registry.
    if (targeted.results.length < 5 || scope === "school") {
      try { broadResults = await searchWeb(searchQuery + " question paper PDF", 40); }
      catch (e) { broadError = clip((e as Error)?.message || e, 300); }
    }

    const allRows = [...targeted.results, ...broadResults.map((r) => {
      const matched = eligible.find((s: any) => r.domain === s.domain || r.domain.endsWith("." + s.domain));
      return { ...r, source: matched || null };
    })];
    const unique = new Map<string, any>();
    for (const row of allRows) if (!unique.has(row.url.toLowerCase())) unique.set(row.url.toLowerCase(), row);
    const flattened = [...unique.values()];
    const providerErrors = [...targeted.errors];
    if (broadError) providerErrors.push("Broad web search: " + broadError);

    if (!targeted.successfulQueries && !broadResults.length) {
      const message = providerErrors.join(" | ") || "No search provider returned a usable response.";
      await admin.from("qb_paper_discovery_runs").update({
        status: "failed", error_message: clip(message, 1000), completed_at: new Date().toISOString(),
      }).eq("id", run.id);
      return reply(502, {
        error: "Search provider was unavailable or returned an unrecognized response. This is not a genuine zero-result search.",
        provider: "Official board archive + DuckDuckGo fallback", provider_errors: providerErrors,
      });
    }

    const inserts = flattened.slice(0, 80).map((r) => ({
      discovery_run_id: run.id, source_id: r.source?.id || null, source_type: scope,
      source_domain: r.domain, title: r.title, source_url: r.url,
      pdf_url: /\.pdf(?:$|[?#])/i.test(r.url) ? r.url : null,
      discovered_school_name: scope === "school" ? schoolName || null : null,
      discovery_metadata: {
        snippet: r.snippet,
        trust_level: r.source?.trust_level || "unverified",
        source_name: r.source?.display_name || r.domain,
        source_match: r.source ? "approved_registry" : "unregistered_domain",
        search_provider: r.snippet.startsWith("Official CBSE") ? "CBSE official archive crawler" : "DuckDuckGo HTML",
        search_method: r.source ? "targeted_domain" : "broad_web",
      },
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
    const matchedCount = flattened.filter((r) => r.source).length;
    const runStatus = providerErrors.length && !flattened.length ? "failed" : "completed";
    await admin.from("qb_paper_discovery_runs").update({
      status: runStatus, results_found: flattened.length,
      error_message: providerErrors.length ? clip(providerErrors.join(" | "), 1000) : null,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);
    return reply(200, {
      run_id: run.id, found: flattened.length, new_candidates: inserted,
      approved_source_results: matchedCount, unregistered_source_results: flattened.length - matchedCount,
      provider: "Official board archive + DuckDuckGo fallback", provider_successful_queries: targeted.successfulQueries,
      provider_errors: providerErrors,
      message: providerErrors.length
        ? "Search completed with partial provider failures. Review the provider diagnostics before concluding no papers exist."
        : "Search completed. Review candidates before importing.",
    });
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
    if ((boardId === null) === (schoolId === null) || !gradeId || !subject || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1 || !["main","compartment","supplementary","sample","other"].includes(examType) || !["English","Hindi","Kannada","Sanskrit","Other"].includes(medium)) {
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
    const upload = await admin.storage.from("qb-papers").upload(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { contentType: "application/pdf", upsert: false });
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
