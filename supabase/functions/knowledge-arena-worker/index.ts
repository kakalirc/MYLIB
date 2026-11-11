import { adminClient, errorResponse, json, safeNumber, indiaDate, indiaDayStartIso } from "../_shared/knowledge-arena.ts";
import { parseJsonResponse } from "./json-response.ts";

const MODEL = Deno.env.get("KA_ANTHROPIC_MODEL") || "claude-haiku-4-5";
const MAX_BATCH = 20;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-ka-worker-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function anthropic(apiKey: string, system: string, prompt: string, maxTokens: number) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || "AI provider request failed.");
  const text = (data.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n");
  return { text, inputTokens: safeNumber(data.usage?.input_tokens), outputTokens: safeNumber(data.usage?.output_tokens) };
}

async function requestStructuredJson(
  apiKey: string,
  system: string,
  prompt: string,
  maxTokens: number,
  label: string,
  isValid: (value: any) => boolean,
  recordUsage: (inputTokens: number, outputTokens: number) => void,
): Promise<any> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryInstruction = attempt === 1 ? "" :
      "\\nThe previous response was malformed or did not match the required JSON schema. Return exactly one complete JSON value, with no second JSON block or trailing commentary.";
    const response = await anthropic(apiKey, system, prompt + retryInstruction, maxTokens);
    recordUsage(response.inputTokens, response.outputTokens);
    try {
      const value = parseJsonResponse(response.text);
      if (!isValid(value)) throw new Error(label + " JSON did not match its required schema.");
      return value;
    } catch (error) {
      lastError = error;
      console.warn("Knowledge Arena structured response retry", {
        response_type: label, attempt, error: String((error as Error).message || error).slice(0, 240),
      });
    }
  }
  throw new Error(label + " response remained invalid after two attempts: " +
    String((lastError as Error)?.message || lastError || "invalid JSON").slice(0, 300));
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

  const { data: pricing, error: pricingError } = await db.from("ka_settings")
    .select("ai_input_usd_per_million,ai_output_usd_per_million,usd_inr_rate")
    .eq("id", 1).maybeSingle();
  if (pricingError || !pricing) throw new Error("AI pricing and FX configuration is unavailable; generation stopped safely.");
  const inputRate = Number(pricing.ai_input_usd_per_million);
  const outputRate = Number(pricing.ai_output_usd_per_million);
  const usdInrRate = Number(pricing.usd_inr_rate);
  if (![inputRate, outputRate, usdInrRate].every(Number.isFinite) || inputRate <= 0 || outputRate <= 0 || usdInrRate <= 0) {
    throw new Error("AI token prices and USD/INR rate are invalid; generation stopped safely.");
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

  let generated = 0, validated = 0, drafted = 0, rejected = 0, inputTokens = 0, outputTokens = 0;
  const shapeRejections: string[] = [];
  const validationRejections: string[] = [];
  const saveRejected = async (q: any, stage: string, reason: string) => {
    const safeCandidate = q && typeof q === "object" ? q : { raw_value: q ?? null };
    const { error } = await db.from("ka_rejected_questions").insert({
      job_id: job.id, subject: job.subject, grade_label: job.grade_label,
      game_type: job.game_type, difficulty: job.difficulty, language_code: job.language_code,
      topic: job.topic || job.subject, candidate: safeCandidate,
      rejection_stage: stage, rejection_reason: reason.slice(0, 1200),
    });
    if (error) throw new Error("Could not persist a rejected Knowledge Arena candidate: " + error.message);
  };
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
    const gameGuidance: Record<string, string> = {
      word_master: "Focus on vocabulary, spelling, meanings and language usage.",
      word_builder: "Focus on word formation, spelling, vocabulary and grammar.",
      number_quest: "Focus on mathematical concepts, number sense and calculations.",
      math_sprint: "Focus on concise mental-maths and calculation challenges.",
      science_explorer: "Focus on age-appropriate scientific concepts and applications.",
      world_explorer: "Focus on geography, places, maps and physical or human geography.",
      history_quest: "Focus on historical periods, events, people and chronology.",
      society_culture_challenge: "Focus on sociology, society, culture, institutions and social change.",
      civics_constitution_challenge: "Focus on civics, democracy, constitutional principles and governance.",
      economics_explorer: "Focus on economic concepts, markets, production, demand and supply.",
      money_matters: "Focus on financial literacy, savings, budgeting and responsible money decisions.",
      quick_quiz: "Use varied subject knowledge checks.",
      brain_teaser: "Focus on reasoning, patterns and logical thinking grounded in the selected subject.",
      memory_challenge: "Create a short recall challenge using subject facts or patterns."
    };
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
       + "- Game-specific content guidance: " + (gameGuidance[job.game_type] || "Use the selected subject and grade.") + "\n"
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
    const candidates = await requestStructuredJson(
      ai.api_key, system, prompt, 6000, "Generator",
      (value) => Array.isArray(value) && value.length > 0,
      (input, output) => { inputTokens += input; outputTokens += output; },
    );
    assertLease();
    generated = candidates.length;

    const { data: existing } = await db.from("ka_questions").select("prompt")
      .eq("subject", job.subject).eq("grade_label", job.grade_label).limit(5000);
    const seen = new Set((existing || []).map((x: any) => normalisePrompt(x.prompt)));
    for (const q of candidates.slice(0, job.requested_count)) {
      const shapeIssue = validateShape(q, job);
      const normalized = typeof q?.prompt === "string" ? normalisePrompt(q.prompt) : "";
      if (shapeIssue || !normalized || seen.has(normalized)) {
        const reason = shapeIssue || (!normalized ? "empty prompt" : "duplicate prompt");
        rejected++;
        shapeRejections.push(reason);
        await saveRejected(q, reason === "duplicate prompt" ? "duplicate" : "structural", reason);
        continue;
      }
      if (q.options.length !== 4) {
        rejected++;
        const reason = "Candidate has " + q.options.length + " options. Admin must complete the fourth option and confirm the answer key.";
        shapeRejections.push(reason);
        await saveRejected(q, "manual_option_completion", reason);
        continue;
      }
      const validatorPrompt = "Review this educational MCQ using the rubric below. Return JSON only: {\"approved\":boolean,\"issues\":[string],\"severity\":\"critical|review|none\"}.\n"
        + "Reject only demonstrable problems: factual error, more than one defensible answer, no correct answer, materially ambiguous wording, unsafe/inappropriate content, or clear mismatch with the stated grade/subject. Do NOT reject merely because you are uncertain or cannot independently recall a niche fact. For uncertainty, use approved=false and explain exactly what needs human verification; severity must be review. Issues must identify the specific option or phrase and explain why it is problematic. If no material issue is found, approve with an empty issues array.\nQuestion JSON:\n"
        + JSON.stringify(q);
      assertLease();
      const verdict = await requestStructuredJson(
        ai.api_key,
        "You are an educational quality reviewer. Be evidence-minded, fair and precise. Do not invent defects. Distinguish a proven error from uncertainty requiring a human check. Evaluate the actual question and options, not stylistic preferences.",
        validatorPrompt, 900, "Validator",
        (value) => !!value && typeof value === "object" &&
          typeof value.approved === "boolean" &&
          Array.isArray(value.issues) &&
          value.issues.every((issue: unknown) => typeof issue === "string") &&
          ["critical","review","none"].includes(value.severity),
        (input, output) => { inputTokens += input; outputTokens += output; },
      );
      assertLease();
      if (verdict.approved !== true || verdict.issues.length > 0) {
        rejected++;
        const reason = verdict.issues.join("; ").slice(0, 1000) || "Validator flagged this candidate for manual verification.";
        validationRejections.push(reason.slice(0, 240));
        await saveRejected(q, verdict.severity === "critical" ? "validator_critical" : "validator_review", reason);
        continue;
      }
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
      if (storeError) {
        rejected++;
        await saveRejected(q, "storage", "Could not save as Draft: " + storeError.message);
        continue;
      }
      seen.add(normalized);
      validated++;
      drafted++;
    }

    const actualCostUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    const actualCostInr = actualCostUsd * usdInrRate;
    const totalCostUsd = priorCostUsd + actualCostUsd;
    const totalCostInr = priorCostInr + actualCostInr;
    const status = drafted === job.requested_count ? "completed" : drafted > 0 ? "partial" : "failed";
    if (rejected) console.warn("Knowledge Arena question rejection summary", {
      job_id: job.id, grade_label: job.grade_label, subject: job.subject,
      generated, rejected, shape_rejections: shapeRejections.slice(0, 12),
      validation_rejections: validationRejections.slice(0, 12),
    });
    assertLease();
    await updateJob(db, job.id, {
      status, generated_count: generated, validated_count: validated, drafted_count: drafted, published_count: 0,
      rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
      estimated_cost_usd: totalCostUsd, estimated_cost_inr: priorCostInr + actualCostInr, usd_inr_rate: usdInrRate,
      completed_at: new Date().toISOString(),
      ...(drafted ? { error_code: null, error_summary: null } : { error_code: "no_questions_drafted", error_summary: "No candidate was promoted to Draft. Rejected candidates and reasons are available in Admin Manual Validation." }),
    });
    if (usageId) {
      const { error: settleError } = await db.from("ka_ai_usage").update({
        status: "settled", actual_cost_usd: actualCostUsd, actual_cost_inr: actualCostInr,
        input_tokens: inputTokens, output_tokens: outputTokens, settled_at: new Date().toISOString(),
      }).eq("id", usageId);
      if (settleError) throw new Error("AI usage was not settled; its reservation remains charged against the budget.");
    }
    return { job_id: job.id, status, generated, validated, drafted, rejected, estimated_cost_inr: priorCostInr + actualCostInr };
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
      const failureStatus = drafted > 0 ? "partial" : "failed";
      await updateJob(db, job.id, {
        status: failureStatus, generated_count: generated, validated_count: validated, drafted_count: drafted, published_count: 0,
        rejected_count: rejected, model: MODEL, input_tokens: inputTokens, output_tokens: outputTokens,
        estimated_cost_usd: priorCostUsd + (usageId ? reservedCostUsd : 0),
        estimated_cost_inr: priorCostInr + (usageId ? reservedCostInr : 0),
        usd_inr_rate: usdInrRate, completed_at: new Date().toISOString(),
        error_code: drafted > 0 ? "generation_interrupted_after_partial" : "generation_failed",
        error_summary: String((e as Error).message || e).slice(0, 500),
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
  const supplied = req.headers.get("x-ka-worker-secret") || "";
  if (!supplied) return errorResponse(401, "Worker authentication failed.");
  try {
    const db = adminClient();
    const { data: authorised, error: authError } = await db.rpc("ka_verify_worker_secret", { p_supplied: supplied });
    if (authError || authorised !== true) return errorResponse(401, "Worker authentication failed.");
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
