// Trusted preflight/claim endpoint for Admin Question Bank paper extraction.
// This endpoint deliberately does not call Anthropic or any other AI provider.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""));
function positiveIntSetting(name: string, fallback: number, hardMax: number): number {
  const raw = Deno.env.get(name);
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > hardMax) {
    throw new Error(name + " must be a whole number from 1 to " + hardMax + ".");
  }
  return value;
}
const MAX_PDF_MB = positiveIntSetting("QB_EXTRACTION_MAX_PDF_MB", 20, 100);
const MAX_PAGES = positiveIntSetting("QB_EXTRACTION_MAX_PAGES", 25, 200);
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

function storageObject(stored: string): { bucket: string; path: string } | null {
  const value = String(stored || "").trim();
  if (!value) return null;
  const direct = value.match(/^qb-papers\/(.+)$/);
  if (direct) return { bucket: "qb-papers", path: direct[1] };
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply(500, { error: "Server configuration is incomplete." });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Please sign in again." });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: "Please sign in again." });

  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role,archived").eq("id", auth.user.id).maybeSingle();
  if (profileError || profile?.role !== "Admin" || profile?.archived === true) {
    return reply(403, { error: "Only an active Admin can prepare a paper for extraction." });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const paperId = String(body.source_paper_id || "");
  if (!uuid(paperId)) return reply(400, { error: "A valid source paper ID is required." });

  const { data: paper, error: paperError } = await admin.from("qb_source_papers")
    .select("id,status,extraction_status,stored_pdf_url,source_type,school_id,board_id,grade_id,subject_name,year,exam_type,medium")
    .eq("id", paperId).maybeSingle();
  if (paperError) return reply(500, { error: "Could not inspect the selected paper: " + paperError.message });
  if (!paper) return reply(404, { ok: false, code: "paper_not_found", message: "The selected source paper no longer exists. No AI request was made." });
  if (paper.status !== "published") return reply(409, { ok: false, code: "paper_not_published", message: "Only a published source paper can be extracted. No AI request was made." });

  const { count: linkedCount, error: countError } = await admin.from("qb_questions")
    .select("id", { count: "exact", head: true }).eq("source_paper_id", paperId);
  if (countError) return reply(500, { error: "Could not verify existing Question Bank records: " + countError.message });
  if (paper.extraction_status === "extracted" || (linkedCount || 0) > 0) {
    return reply(409, {
      ok: false, code: "already_extracted",
      message: `Already extracted into Question Bank — ${linkedCount || 0} question records are linked. AI extraction will not run; no AI credits will be used.`,
      linked_question_count: linkedCount || 0, extraction_status: paper.extraction_status,
    });
  }

  const { data: previousRuns, error: runError } = await admin.from("qb_paper_extraction_runs")
    .select("id,status,ai_request_state,started_at")
    .eq("source_paper_id", paperId).order("started_at", { ascending: false });
  if (runError) return reply(500, { error: "Could not verify extraction history: " + runError.message });
  // Inspect all history: a newer safe failure must not hide an older provider attempt.
  const previous = (previousRuns || []).find((run) =>
    ["queued", "processing", "completed", "uncertain"].includes(run.status)
    || ["sent", "responded", "uncertain"].includes(run.ai_request_state)
  );
  if (previous) {
    return reply(409, {
      ok: false, code: "prior_extraction_run",
      message: "A previous extraction attempt exists. It must be inspected or reconciled before another AI request. No AI request was made.",
      run_id: previous.id, run_status: previous.status, ai_request_state: previous.ai_request_state,
    });
  }

  const object = storageObject(paper.stored_pdf_url);
  if (!object || object.bucket !== "qb-papers" || !object.path || object.path.includes("..")) {
    return reply(422, { ok: false, code: "unsupported_pdf_location", message: "The paper must be stored in the approved private qb-papers bucket. No AI request was made." });
  }
  const { data: pdf, error: downloadError } = await admin.storage.from(object.bucket).download(object.path);
  if (downloadError || !pdf) return reply(422, { ok: false, code: "pdf_unavailable", message: "The stored PDF could not be retrieved. No AI request was made." });
  if (pdf.size > MAX_PDF_BYTES) return reply(413, { ok: false, code: "pdf_too_large", message: "This PDF exceeds the configured "+MAX_PDF_MB+" MB extraction limit. No AI request was made." });
  const bytes = await pdf.arrayBuffer();
  if (bytes.byteLength < 8 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return reply(422, { ok: false, code: "invalid_pdf", message: "The stored file is not a valid PDF. No AI request was made." });
  }
  let pageCount: number;
  try {
    const parsedPdf = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: false, updateMetadata: false });
    pageCount = parsedPdf.getPageCount();
  } catch {
    return reply(422, { ok: false, code: "invalid_pdf", message: "The PDF could not be parsed or is encrypted. No AI request was made." });
  }
  if (pageCount < 1 || pageCount > MAX_PAGES) {
    return reply(413, { ok: false, code: "pdf_page_limit", message: `This PDF has ${pageCount} pages; the configured limit is ${MAX_PAGES} pages. No AI request was made.`, page_count: pageCount, max_pages: MAX_PAGES });
  }
  const checksum = await sha256Hex(bytes);

  // Metadata matches are advisory only. Different series/sets can share metadata.
  let duplicateQuery = admin.from("qb_source_papers")
    .select("id,year,subject_name,exam_type,medium,extraction_status,question_count")
    .neq("id", paperId).eq("grade_id", paper.grade_id)
    .eq("subject_name", paper.subject_name).eq("year", paper.year)
    .eq("exam_type", paper.exam_type).eq("medium", paper.medium)
    .eq("extraction_status", "extracted").limit(10);
  if (paper.source_type === "school" && paper.school_id) duplicateQuery = duplicateQuery.eq("school_id", paper.school_id);
  else if (paper.board_id) duplicateQuery = duplicateQuery.eq("board_id", paper.board_id);
  const { data: possibleDuplicates } = await duplicateQuery;

  const { data: claim, error: claimError } = await admin.rpc("qb_begin_paper_extraction", {
    p_source_paper_id: paperId,
    p_requested_by: auth.user.id,
    p_pdf_sha256: checksum,
  });
  if (claimError) return reply(500, { ok: false, code: "claim_failed", message: "The safety gate could not claim this paper. No AI request was made." });
  if (!claim?.ok) return reply(409, claim);

  return reply(200, {
    ...claim,
    pdf_sha256: checksum,
    possible_metadata_matches: possibleDuplicates || [],
    metadata_match_is_warning_only: true,
    ai_provider_called: false,
  });
});
