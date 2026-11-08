import { adminClient, errorResponse, json, safeNumber, indiaDate, indiaDayStartIso } from "../_shared/knowledge-arena.ts";

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
  if (q.options.length !== 4) return "exactly four options are required";
  if (typeof q.topic !== "string" || !q.topic.trim()) return "missing topic";
  if (q.subject && q.subject !== job.subject) return "subject mismatch";
  if (q.grade_label && q.grade_label !== job.grade_label) return "grade mismatch";
  if (q.game_type && q.game_type !== job.game_type) return "game type mismatch";
  if (q.language_code && q.language_code !== job.language_code) return "language mismatch";
  if (q.difficulty && q.difficulty !== job.difficulty) return "difficulty mismatch";
  return null;
}

async function updateJob(db: ReturnType<typeof adminClient>, id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("ka_generation_jobs").update(patch).eq("id", id);
  if (error) throw new Error("Could not update generation job state.");
}

async function releaseWorkerLease(db: ReturnType<typeof adminClient>, leaseToken: string) {
  const { data, error } = await db.rpc("ka_release_worker_lease", { p_lease_token: leaseToken });
  if (error || data !== true) console.error("Knowledge Arena worker lease was not released by its owner", error);
}

async function runOneJob(db: ReturnType<typeof adminClient>) {
  const { data: settings, error: settingsError } = await db.from("ka_settings")
    .select("generation_enabled,daily_challenge_enabled,daily_ai_budget_inr,monthly_ai_budget_inr").eq("id", 1).maybeSingle();
  if (settingsError || !settings) throw new Error("Knowledge Arena settings are not initialised.");
  // Daily challenge publication uses already-published content and does not
  // require AI generation. The RPC is idempotent for each India-local date.
  if (settings.daily_challenge_enabled) {
    const { error: challengeError } = await db.rpc("ka_publish_daily_challenges", { p_challenge_date: indiaDate() });
    if (challengeError) console.warn("Daily challenge publication did not complete", challengeError);
  }
  if (!settings.generation_enabled) return { skipped: "generation_paused" };

  const inputRate = Number(Deno.env.get("KA_INPUT_USD_PER_MILLION"));
  const outputRate = Number(Deno.env.get("KA_OUTPUT_USD_PER_MILLION"));
  const usdInrRate = Number(Deno.env.get("KA_USD_INR_RATE"));
  if (![inputRate, outputRate, usdInrRate].every(Number.isFinite) || inputRate <= 0 || outputRate <= 0 || usdInrRate <= 0) {
    throw new Error("AI token prices and KA_USD_INR_RATE are not configured; generation stopped safely.");
  }
  const { data: ai, error: aiError } = await db.from("ai_settings").select("api_key,master_enabled").eq("id", 1).maybeSingle();
  if (aiError || !ai?.api_key || ai.master_enabled === false) throw new Error("AI is unavailable or disabled in LIB AI Settings.");

  // The database RPC takes a singleton lease before claiming a job. Only one worker
  // can reserve shared budget or call the provider at a time.
  const leaseToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db.rpc("ka_claim_generation_job", { p_lease_token: leaseToken });
  if (claimError) throw new Error("Could not claim a generation job. Apply the reviewed Knowledge Arena schema first.");
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return { skipped: "no_queued_jobs_or_worker_lease_active" };

  let generated = 0, validated = 0, published = 0, rejected = 0, inputTokens = 0, outputTokens = 0;
  let usageId: string | null = null;
  let reservedCostInr = 0, reservedCostUsd = 0;
  let leaseLost = false, heartbeatBusy = false;
  const priorCostInr = safeNumber(job.estimated_cost_inr);
  const priorCostUsd = safeNumber(job.estimated_cost_usd);
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || leaseLost) return;
    heartbeatBusy = true;
    try {
      const { data, error } = await db.rpc("ka_renew_worker_lease", { p_lease_token: leaseToken });
      if (error || data !== true) {
        leaseLost = true;
        console.error("Knowledge Arena worker lease renewal failed", error);
      }
    } catch (error) {
      leaseLost = true;
      console.error("Knowledge Arena worker lease renewal failed", error);
    } finally {
      heartbeatBusy = false;
    }
  }, 45_000);
  const assertLease = () => {
    if (leaseLost) throw new Error("Worker lease lost; stopped before making further AI calls.");
  };

  try {
    if (job.requested_count > MAX_BATCH) {
      await updateJob(db, job.id, {
        status: "failed", error_code: "batch_too_large",
        error_summary: "Batch exceeds worker safety limit.", completed_at: new Date().toISOString(),
      });
      return { job_id: job.id, status: "failed" };
    }

    // Shared budget windows follow the India-local calendar day and month.
    const today = indiaDate();
    const [indiaYear, indiaMonth] = today.split("-");
    const dayStart = indiaDayStartIso(today);
    const monthStart = indiaDayStartIso(indiaYear + "-" + indiaMonth + "-01");
    const [dayResult, monthResult] = await Promise.all([
      db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", dayStart),
      db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", monthStart),
    ]);
    if (dayResult.error || monthResult.error) throw new Error("Could not calculate shared AI budget usage.");
    const effectiveCost = (x: any) => x.status === "settled" ? safeNumber(x.actual_cost_inr) : safeNumber(x.reserved_cost_inr);
    const daySpent = (dayResult.data || []).reduce((n: number, x: any) => n + effectiveCost(x), 0);
    const monthSpent = (monthResult.data || []).reduce((n: number, x: any) => n + effectiveCost(x), 0);
    const dailyBudget = safeNumber(settings.daily_ai_budget_inr, 100);
    const monthlyBudget = safeNumber(settings.monthly_ai_budget_inr, 1000);

    if (daySpent >= dailyBudget || monthSpent >= monthlyBudget) {
      await updateJob(db, job.id, {
        status: "paused", error_code: "ai_budget_reached",
        error_summary: "Paused: shared India-local daily or monthly INR budget reached.",
      });
      return { job_id: job.id, status: "paused", reason: "ai_budget_reached", daily_spent_inr: daySpent, monthly_spent_inr: monthSpent };
    }

    // Conservative 50% safety margin. Reserve this batch's estimated maximum in
    // the job row before making a paid provider call, so an interrupted worker
    // cannot make its in-flight spend invisible to the next budget check.
    const estimatedInputTokens = job.requested_count * 1200 + 1800;
    const estimatedOutputTokens = 6000 + job.requested_count * 900;
    const estimatedMaxCostUsd = (estimatedInputTokens * inputRate + estimatedOutputTokens * outputRate) / 1000000;
    const estimatedMaxCostInr = estimatedMaxCostUsd * usdInrRate * 1.5;
    const remainingInr = Math.max(0, Math.min(dailyBudget - daySpent, monthlyBudget - monthSpent));
    if (estimatedMaxCostInr > remainingInr) {
      await updateJob(db, job.id, {
        status: "paused", error_code: "budget_preflight",
        error_summary: "Paused before AI call: conservative estimated batch cost exceeds remaining daily or monthly INR budget.",
      });
      return { job_id: job.id, status: "paused", reason: "budget_preflight", estimated_max_cost_inr: estimatedMaxCostInr };
    }
    reservedCostInr = estimatedMaxCostInr;
    reservedCostUsd = estimatedMaxCostUsd * 1.5;
    const { data: usage, error: usageError } = await db.from("ka_ai_usage").insert({
      job_id: job.id, status: "reserved",
      reserved_cost_usd: reservedCostUsd, reserved_cost_inr: reservedCostInr,
      usd_inr_rate: usdInrRate,
    }).select("id").single();
    if (usageError || !usage?.id) throw new Error("Could not reserve shared AI budget before the provider call.");
    usageId = usage.id;
    await updateJob(db, job.id, {
      estimated_cost_inr: priorCostInr + reservedCostInr,
      estimated_cost_usd: priorCostUsd + reservedCostUsd,
      usd_inr_rate: usdInrRate,
    });

    const system = "You create high-quality, age-appropriate educational multiple-choice questions. Output only valid JSON. Never invent current events, recent facts, citations, URLs, or source claims. Prefer stable, evergreen knowledge and curriculum fundamentals. Exactly one answer must be correct. Avoid ambiguity, trick wording, stereotypes, sensitive topics, and facts that vary by region unless the region is specified.";
    const prompt = "Create " + job.requested_count + " original MCQ questions for LIB Knowledge Arena.\n"
      + "Return a JSON array only. Each object must have:\n"
      + "{\"subject\":string,\"topic\":string,\"grade_label\":string,\"language_code\":string,\"difficulty\":\"easy|medium|hard\",\"game_type\":string,\"prompt\":string,\"options\":[string,string,string,string],\"correct_option\":integer_zero_based,\"explanation\":string,\"source_reference\":null}\n"
      + "Constraints:\n"
      + "- Subject: " + job.subject + "\n"
      + "- Topic: " + (job.topic || job.subject) + "\n"
      + "- Grade/class: " + job.grade_label + "\n"
      + "- Language: " + job.language_code + "\n"
      + "- Difficulty: " + job.difficulty + "\n"
      + "- Game type: " + job.game_type + "\n"
      + "- Exactly four concise options and exactly one defensible correct answer.\n"
      + "- Use vocabulary and concepts suitable for the specified grade.\n"
      + "- Do not include current affairs or time-sensitive facts.\n"
      + "- Avoid duplicate or near-duplicate questions.\n"
      + "- Keep explanation clear and educational.\n"
      + (job.game_type === "memory_challenge"
        ? "- Memory Challenge: create a short sequence, pattern, set of facts or visualisable detail in the prompt, then ask one recall question about it. The student will study the prompt briefly before answering.\n"
        : "")
      + "- Do not include markdown or prose outside the JSON array.";
    assertLease();
    const generatedResponse = await anthropic(ai.api_key, system, prompt, 6000);
    assertLease();
    inputTokens += generatedResponse.inputTokens;
    outputTokens += generatedResponse.outputTokens;
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
      const validatorPrompt = "Independently check this MCQ for factual correctness, unambiguous wording, grade suitability, exactly one correct option, and whether the explanation supports the answer. Do not rewrite it. If you cannot confidently verify it from stable, well-established knowledge, reject it. Return JSON only: {\"approved\":boolean,\"issues\":[string]}.\nQuestion JSON:\n"
        + JSON.stringify(q);
      assertLease();
      const validation = await anthropic(ai.api_key, "You are a strict independent educational content auditor. Reject doubtful, ambiguous, inaccurate, or unsuitable questions. Do not approve merely because the supplied answer claims to be correct.", validatorPrompt, 900);
      assertLease();
      inputTokens += validation.inputTokens;
      outputTokens += validation.outputTokens;
      const verdict = parseJson(validation.text);
      if (!verdict || verdict.approved !== true || !Array.isArray(verdict.issues)) { rejected++; continue; }
      const payload = {
        subject: job.subject, topic: String(q.topic || job.topic || job.subject),
        grade_label: job.grade_label, language_code: job.language_code,
        difficulty: job.difficulty, game_type: job.game_type,
        prompt: q.prompt.trim(), options: q.options, explanation: q.explanation.trim(),
        source_reference: null,
      };
      assertLease();
      const { error: storeError } = await db.rpc("ka_store_generated_question", {
        p_job_id: job.id, p_question: payload, p_correct_option: q.correct_option,
      });
      if (storeError) { rejected++; continue; }
      seen.add(normalized);
      validated++;
      published++;
    }

    const actualCostUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    const actualCostInr = actualCostUsd * usdInrRate;
    const totalCostUsd = priorCostUsd + actualCostUsd;
    const totalCostInr = priorCostInr + actualCostInr;
    const status = published === job.requested_count ? "completed" : published > 0 ? "partial" : "failed";
    if (settings.daily_challenge_enabled && published > 0) {
      assertLease();
      const { error: challengeError } = await db.rpc("ka_publish_daily_challenges", { p_challenge_date: indiaDate() });
      if (challengeError) console.warn("Post-generation daily challenge publication did not complete", challengeError);
    }
    assertLease();
    await updateJob(db, job.id, {
      status, generated_count: generated, validated_count: validated, published_count: published,
      rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: totalCostUsd, estimated_cost_inr: priorCostInr + actualCostInr, usd_inr_rate: usdInrRate,
      completed_at: new Date().toISOString(),
      ...(published ? {} : { error_code: "no_questions_published", error_summary: "No candidate passed structural, duplicate and independent AI validation." }),
    });
    if (usageId) {
      const { error: settleError } = await db.from("ka_ai_usage").update({
        status: "settled", actual_cost_usd: actualCostUsd, actual_cost_inr: actualCostInr,
        input_tokens: inputTokens, output_tokens: outputTokens, settled_at: new Date().toISOString(),
      }).eq("id", usageId);
      if (settleError) throw new Error("AI usage was not settled; its reservation remains charged against the budget.");
    }
    return { job_id: job.id, status, generated, validated, published, rejected, estimated_cost_inr: priorCostInr + actualCostInr };
  } catch (e) {
    const observedCostUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    if (usageId) {
      const { error: reviewError } = await db.from("ka_ai_usage").update({
        status: "review", actual_cost_usd: observedCostUsd,
        actual_cost_inr: observedCostUsd * usdInrRate,
        input_tokens: inputTokens, output_tokens: outputTokens,
      }).eq("id", usageId);
      if (reviewError) console.error("Could not mark AI reservation for review", reviewError);
    }
    if (!leaseLost) {
      await updateJob(db, job.id, {
        status: "failed", generated_count: generated, validated_count: validated, published_count: published,
        rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
        estimated_cost_usd: priorCostUsd + (usageId ? reservedCostUsd : 0),
        estimated_cost_inr: priorCostInr + (usageId ? reservedCostInr : 0),
        usd_inr_rate: usdInrRate, completed_at: new Date().toISOString(),
        error_code: "generation_failed", error_summary: String((e as Error).message || e).slice(0, 500),
      });
    }
    throw e;
  } finally {
    clearInterval(heartbeat);
    await releaseWorkerLease(db, leaseToken);
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
    let requestBody: Record<string, unknown> = {};
    try { requestBody = await req.json(); } catch { requestBody = {}; }
    if (requestBody.action === "publish_daily_challenges") {
      const { data, error } = await db.rpc("ka_publish_daily_challenges", { p_challenge_date: indiaDate() });
      if (error) throw new Error("Could not publish grade-specific daily challenges.");
      return json(200, { publication: data });
    }
    const result = await runOneJob(db);
    return json(200, result);
  } catch (e) {
    console.error("Knowledge Arena worker failed", e);
    return errorResponse(500, "Knowledge Arena generation worker failed.");
  }
});
