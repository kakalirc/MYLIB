import { adminClient, errorResponse, json, safeNumber } from "../_shared/knowledge-arena.ts";

const MODEL = Deno.env.get("KA_ANTHROPIC_MODEL") || "claude-haiku-4-5";
const MAX_BATCH = 20;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-ka-worker-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function anthropic(apiKey: string, system: string, prompt: string, maxTokens: number) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || "AI provider request failed.");
  const text = (data.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n");
  return { text, inputTokens: safeNumber(data.usage?.input_tokens), outputTokens: safeNumber(data.usage?.output_tokens) };
}

function parseJson(text: string): any {
  const cleaned = text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  const firstArray = cleaned.indexOf("[");
  const firstObject = cleaned.indexOf("{");
  const first = firstArray < 0 ? firstObject : firstObject < 0 ? firstArray : Math.min(firstArray, firstObject);
  if (first < 0) throw new Error("AI response was not valid JSON.");
  const opener = cleaned[first];
  const closer = opener === "[" ? "]" : "}";
  const last = cleaned.lastIndexOf(closer) + 1;
  if (last <= first) throw new Error("AI response was not valid JSON.");
  return JSON.parse(cleaned.slice(first, last));
}

function normalisePrompt(s: string) { return s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }

function validateShape(q: any, job: any) {
  if (!q || typeof q !== "object") return "not an object";
  if (typeof q.prompt !== "string" || q.prompt.trim().length < 12 || q.prompt.length > 700) return "invalid prompt";
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some((x: any) => typeof x !== "string" || !x.trim() || x.length > 250)) return "invalid options";
  if (!Number.isInteger(q.correct_option) || q.correct_option < 0 || q.correct_option >= q.options.length) return "invalid correct option index";
  if (new Set(q.options.map((x: string) => x.trim().toLowerCase())).size !== q.options.length) return "duplicate options";
  if (typeof q.explanation !== "string" || q.explanation.trim().length < 8 || q.explanation.length > 900) return "invalid explanation";
  if (typeof q.topic !== "string" || !q.topic.trim()) return "missing topic";
  if (q.options.length < 2) return "insufficient options";
  if (q.subject && q.subject !== job.subject) return "subject mismatch";
  return null;
}

async function updateJob(db: ReturnType<typeof adminClient>, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("ka_generation_jobs").update(patch).eq("id", id);
  if (error) throw new Error("Could not update generation job state.");
}

async function runOneJob(db: ReturnType<typeof adminClient>) {
  const { data: settings, error: settingsError } = await db.from("ka_settings")
    .select("generation_enabled,daily_ai_budget_usd,monthly_ai_budget_usd").eq("id", 1).maybeSingle();
  if (settingsError || !settings) throw new Error("Knowledge Arena settings are not initialised.");
  if (!settings.generation_enabled) return { skipped: "generation_paused" };

  const inputRate = Number(Deno.env.get("KA_INPUT_USD_PER_MILLION"));
  const outputRate = Number(Deno.env.get("KA_OUTPUT_USD_PER_MILLION"));
  if (![inputRate, outputRate].every(Number.isFinite) || inputRate <= 0 || outputRate <= 0) {
    throw new Error("AI token pricing environment variables are not configured; generation stopped safely.");
  }
  const { data: ai, error: aiError } = await db.from("ai_settings").select("api_key,master_enabled").eq("id", 1).maybeSingle();
  if (aiError || !ai?.api_key || ai.master_enabled === false) throw new Error("AI is unavailable or disabled in LIB AI Settings.");

  const now = new Date();
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ data: dayJobs }, { data: monthJobs }] = await Promise.all([
    db.from("ka_generation_jobs").select("estimated_cost_usd").gte("created_at", dayStart.toISOString()),
    db.from("ka_generation_jobs").select("estimated_cost_usd").gte("created_at", monthStart.toISOString()),
  ]);
  const daySpent = (dayJobs || []).reduce((n: number, x: any) => n + safeNumber(x.estimated_cost_usd), 0);
  const monthSpent = (monthJobs || []).reduce((n: number, x: any) => n + safeNumber(x.estimated_cost_usd), 0);
  if (daySpent >= safeNumber(settings.daily_ai_budget_usd) || monthSpent >= safeNumber(settings.monthly_ai_budget_usd)) {
    return { skipped: "ai_budget_reached" };
  }

  const { data: claimed, error: claimError } = await db.rpc("ka_claim_generation_job");
  if (claimError) throw new Error("Could not claim a generation job. Apply the reviewed Knowledge Arena schema first.");
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return { skipped: "no_queued_jobs" };
  if (job.requested_count > MAX_BATCH) {
    await updateJob(db, job.id, { status: "failed", error_code: "batch_too_large", error_summary: "Batch exceeds worker safety limit.", completed_at: new Date().toISOString() });
    return { job_id: job.id, status: "failed" };
  }
  // Conservative preflight budget reservation: if a worst-case batch could exceed
  // either remaining budget, pause it before making any paid provider call.
  const remaining = Math.min(
    safeNumber(settings.daily_ai_budget_usd) - daySpent,
    safeNumber(settings.monthly_ai_budget_usd) - monthSpent,
  );
  const estimatedInputTokens = job.requested_count * 1200 + 1800;
  const estimatedOutputTokens = 6000 + job.requested_count * 900;
  const estimatedMaxCost = (estimatedInputTokens * inputRate + estimatedOutputTokens * outputRate) / 1000000;
  if (estimatedMaxCost > remaining) {
    await updateJob(db, job.id, {
      status: "paused", error_code: "budget_preflight",
      error_summary: "Paused before AI call: estimated maximum batch cost exceeds remaining daily or monthly budget.",
    });
    return { job_id: job.id, status: "paused", reason: "budget_preflight", estimated_max_cost_usd: estimatedMaxCost };
  }

  let generated = 0, validated = 0, published = 0, rejected = 0, inputTokens = 0, outputTokens = 0;
  try {
    const system = "You create high-quality, age-appropriate educational multiple-choice questions. Output only valid JSON. Never invent current events, recent facts, citations, URLs, or source claims. Prefer stable, evergreen knowledge and curriculum fundamentals. Exactly one answer must be correct. Avoid ambiguity, trick wording, stereotypes, sensitive topics, and facts that vary by region unless the region is specified.";
    const prompt = `Create ${job.requested_count} original MCQ questions for LIB Knowledge Arena.
Return a JSON array only. Each object must have:
{"subject":string,"topic":string,"grade_label":string,"language_code":string,"difficulty":"easy|medium|hard","game_type":string,"prompt":string,"options":[string,string,string,string],"correct_option":integer_zero_based,"explanation":string,"source_reference":null}
Constraints:
- Subject: ${job.subject}
- Topic: ${job.topic || job.subject}
- Grade/class: ${job.grade_label}
- Language: ${job.language_code}
- Difficulty: ${job.difficulty}
- Game type: ${job.game_type}
- Exactly four concise options and exactly one defensible correct answer.
- Use vocabulary and concepts suitable for the specified grade.
- Do not include current affairs or time-sensitive facts.
- Avoid duplicate or near-duplicate questions.
- Keep explanation clear and educational.
- Do not include markdown or prose outside the JSON array.`;
    const generatedResponse = await anthropic(ai.api_key, system, prompt, 6000);
    inputTokens += generatedResponse.inputTokens; outputTokens += generatedResponse.outputTokens;
    const candidates = parseJson(generatedResponse.text);
    if (!Array.isArray(candidates)) throw new Error("Generator did not return a JSON array.");
    generated = candidates.length;
    const { data: existing } = await db.from("ka_questions").select("prompt")
      .eq("subject", job.subject).eq("grade_label", job.grade_label).limit(5000);
    const seen = new Set((existing || []).map((x: any) => normalisePrompt(x.prompt)));
    for (const q of candidates.slice(0, job.requested_count)) {
      const shapeIssue = validateShape(q, job);
      const normalized = typeof q?.prompt === "string" ? normalisePrompt(q.prompt) : "";
      if (shapeIssue || !normalized || seen.has(normalized)) { rejected++; continue; }
      const validatorPrompt = `Independently check this MCQ for factual correctness, unambiguous wording, grade suitability, exactly one correct option, and whether the explanation supports the answer. Do not rewrite it. If you cannot confidently verify it from stable, well-established knowledge, reject it. Return JSON only: {"approved":boolean,"issues":[string]}.
Question JSON:
${JSON.stringify(q)}`;
      const validation = await anthropic(ai.api_key, "You are a strict independent educational content auditor. Reject doubtful, ambiguous, inaccurate, or unsuitable questions. Do not approve merely because the supplied answer claims to be correct.", validatorPrompt, 900);
      inputTokens += validation.inputTokens; outputTokens += validation.outputTokens;
      const verdict = parseJson(validation.text);
      if (!verdict || verdict.approved !== true || !Array.isArray(verdict.issues)) { rejected++; continue; }
      const payload = {
        subject: job.subject, topic: String(q.topic || job.topic || job.subject),
        grade_label: job.grade_label, language_code: job.language_code,
        difficulty: job.difficulty, game_type: job.game_type,
        prompt: q.prompt.trim(), options: q.options, explanation: q.explanation.trim(),
        source_reference: null,
      };
      const { error: storeError } = await db.rpc("ka_store_generated_question", {
        p_job_id: job.id, p_question: payload, p_correct_option: q.correct_option,
      });
      if (storeError) { rejected++; continue; }
      seen.add(normalized); validated++; published++;
    }
    const cost = (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    const status = published === job.requested_count ? "completed" : published > 0 ? "partial" : "failed";
    await updateJob(db, job.id, {
      status, generated_count: generated, validated_count: validated, published_count: published,
      rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: cost, completed_at: new Date().toISOString(),
      ...(published ? {} : { error_code: "no_questions_published", error_summary: "No candidate passed structural, duplicate and independent AI validation." }),
    });
    return { job_id: job.id, status, generated, validated, published, rejected, estimated_cost_usd: cost };
  } catch (e) {
    const cost = (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    await updateJob(db, job.id, {
      status: "failed", generated_count: generated, validated_count: validated, published_count: published,
      rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: cost, completed_at: new Date().toISOString(),
      error_code: "generation_failed", error_summary: String((e as Error).message || e).slice(0, 500),
    });
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return errorResponse(405, "Use POST.");
  const expected = Deno.env.get("KA_WORKER_SECRET") || "";
  const supplied = req.headers.get("x-ka-worker-secret") || "";
  if (!expected || !constantTimeEqual(expected, supplied)) return errorResponse(401, "Worker authentication failed.");
  try {
    const db = adminClient();
    const result = await runOneJob(db);
    return json(200, result);
  } catch (e) {
    console.error("Knowledge Arena worker failed", e);
    return errorResponse(500, "Knowledge Arena generation worker failed.");
  }
});
