import { adminClient, authenticate, corsHeaders, errorResponse, indiaDate, indiaDayStartIso, json, studentContext, validGameType, safeNumber } from "../_shared/knowledge-arena.ts";

const MAX_QUESTIONS_PER_ATTEMPT = 30;

async function adminSummary(db: ReturnType<typeof adminClient>) {
  const today = indiaDate();
  const sinceToday = indiaDayStartIso(today);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [players, attempts, active, questions, accuracies, jobs24, jobs30, settings] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "Student").not("linked_student_id", "is", null),
    db.from("ka_attempts").select("id", { count: "exact", head: true }).gte("completed_at", sinceToday),
    db.from("ka_attempts").select("user_id").gte("completed_at", sinceToday).limit(10000),
    db.from("ka_questions").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("ka_attempts").select("accuracy").gte("completed_at", since30d).limit(10000),
    db.from("ka_generation_jobs").select("status,estimated_cost_usd,created_at").gte("created_at", since24h),
    db.from("ka_generation_jobs").select("status,estimated_cost_usd,created_at").gte("created_at", since30d),
    db.from("ka_settings").select("generation_enabled,daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects,daily_ai_budget_usd,monthly_ai_budget_usd").eq("id", 1).maybeSingle(),
  ]);
  const errors = [players, attempts, active, questions, accuracies, jobs24, jobs30, settings].filter(x => x.error);
  if (errors.length) throw new Error("Could not load the Knowledge Arena summary.");
  const accuracyValues = (accuracies.data || []).map((x: { accuracy: number }) => Number(x.accuracy)).filter(Number.isFinite);
  const average = accuracyValues.length ? accuracyValues.reduce((a: number, b: number) => a + b, 0) / accuracyValues.length : null;
  return {
    registered_players: players.count || 0,
    active_players_today: new Set((active.data || []).map((x: { user_id: string }) => x.user_id)).size,
    games_played_today: attempts.count || 0,
    question_bank_published: questions.count || 0,
    average_accuracy_30d: average === null ? null : Math.round(average * 100) / 100,
    generation_jobs_24h: (jobs24.data || []).length,
    generation_failures_24h: (jobs24.data || []).filter((x: { status: string }) => x.status === "failed").length,
    ai_cost_usd_30d: (jobs30.data || []).reduce((n: number, x: { estimated_cost_usd: number }) => n + safeNumber(x.estimated_cost_usd), 0),
    automation: settings.data || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Use POST.");
  try {
    const auth = await authenticate(req);
    if ("error" in auth) return errorResponse(auth.status, auth.error);
    const { db, user, profile } = auth;
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorResponse(400, "Invalid JSON request."); }
    const action = String(body.action || "");

    if (action === "get_catalog") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const [{ data: settings, error: settingsError }, { data: subjects, error: subjectsError }, { data: stats }] = await Promise.all([
        db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle(),
        db.from("subjects").select("name").order("name"),
        db.from("ka_player_stats").select("game_xp,games_played,questions_answered,correct_answers,current_streak,best_streak,last_played_on").eq("user_id", user.id).maybeSingle(),
      ]);
      if (settingsError || subjectsError) return errorResponse(503, "Knowledge Arena is not configured yet.");
      if (!settings) return errorResponse(503, "Knowledge Arena database setup is pending.");
      return json(200, {
        games_enabled: settings.games_enabled,
        games: [
          { id: "word_master", name: "Word Master", category: "academic" },
          { id: "number_quest", name: "Number Quest", category: "academic" },
          { id: "science_explorer", name: "Science Explorer", category: "academic" },
          { id: "quick_quiz", name: "Quick Quiz", category: "fun" },
          { id: "brain_teaser", name: "Brain Teaser", category: "fun" },
          { id: "memory_challenge", name: "Memory Challenge", category: "fun" },
        ].filter((g) => settings.games_enabled && !(settings.disabled_game_types || []).includes(g.id)),
        subjects: (subjects || []).map((s: { name: string }) => s.name).filter((s: string) => !(settings.disabled_subjects || []).includes(s)),
        progress: stats || { game_xp: 0, games_played: 0, questions_answered: 0, correct_answers: 0, current_streak: 0, best_streak: 0 },
        grade_label: ctx.gradeLabel,
      });
    }

    if (action === "get_questions") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const gameType = body.game_type;
      if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const difficulty = body.difficulty === undefined ? "" : String(body.difficulty);
      if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) return errorResponse(400, "Invalid difficulty.");
      const { data: settings } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!settings?.games_enabled || (settings.disabled_game_types || []).includes(gameType)) return errorResponse(423, "This game is currently unavailable.");
      if (subject && (settings.disabled_subjects || []).includes(subject)) return errorResponse(423, "This subject is currently unavailable.");
      let query = db.from("ka_questions")
        .select("id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options")
        .eq("status", "published").eq("grade_label", ctx.gradeLabel).eq("game_type", gameType)
        .order("created_at", { ascending: false }).limit(Math.min(Math.max(safeNumber(body.limit, 10), 1), 20));
      if (subject) query = query.eq("subject", subject);
      if (difficulty) query = query.eq("difficulty", difficulty);
      const { data, error } = await query;
      if (error) return errorResponse(503, "Could not load questions.");
      return json(200, { questions: data || [], grade_label: ctx.gradeLabel });
    }

    if (action === "get_daily_challenge") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const today = indiaDate();
      const { data: challenge, error } = await db.from("ka_daily_challenges")
        .select("id,challenge_date,title,description,status")
        .eq("challenge_date", today).eq("status", "published").maybeSingle();
      if (error) return errorResponse(503, "Could not load today's challenge.");
      if (!challenge) return json(200, { challenge: null });
      const { data: items, error: itemError } = await db.from("ka_daily_challenge_items")
        .select("sort_order,question:ka_questions(id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options)")
        .eq("challenge_id", challenge.id).order("sort_order");
      if (itemError) return errorResponse(503, "Could not load today's challenge questions.");
      const questions = (items || []).map((x: { question: unknown }) => x.question).filter(Boolean);
      return json(200, { challenge, questions });
    }

    if (action === "submit_attempt") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const gameType = body.game_type;
      if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
      const selections = body.answers;
      if (!Array.isArray(selections) || selections.length < 1 || selections.length > MAX_QUESTIONS_PER_ATTEMPT) {
        return errorResponse(400, "Submit between 1 and 30 answers.");
      }
      const seen = new Set<string>();
      for (const item of selections) {
        if (!item || typeof item.question_id !== "string" || !Number.isInteger(item.option_index) || item.option_index < 0 || seen.has(item.question_id)) {
          return errorResponse(400, "Answer format is invalid.");
        }
        seen.add(item.question_id);
      }
      const ids = [...seen];
      const { data: questions, error: questionError } = await db.from("ka_questions")
        .select("id,subject,topic,grade_label,difficulty,game_type,prompt,options,explanation")
        .in("id", ids).eq("status", "published").eq("grade_label", ctx.gradeLabel);
      if (questionError || !questions || questions.length !== ids.length) return errorResponse(400, "One or more questions are unavailable.");
      if (questions.some((q: any) => q.game_type !== gameType)) return errorResponse(400, "Questions do not match the selected game.");
      const subjectSet = new Set(questions.map((q: any) => q.subject));
      const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : null;
      if (!challengeId && subjectSet.size !== 1) return errorResponse(400, "A practice attempt must contain questions from one subject.");
      const { data: gameSettings } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!gameSettings?.games_enabled || (gameSettings.disabled_game_types || []).includes(gameType) ||
          questions.some((q: any) => (gameSettings.disabled_subjects || []).includes(q.subject))) {
        return errorResponse(423, "This game or subject is currently unavailable.");
      }
      const { data: keys, error: keyError } = await db.from("ka_question_keys")
        .select("question_id,correct_option").in("question_id", ids);
      if (keyError || !keys || keys.length !== ids.length) return errorResponse(503, "Answer validation is unavailable.");
      const keyMap = new Map(keys.map((k: any) => [k.question_id, Number(k.correct_option)]));
      const results = selections.map((s: any) => {
        const q = questions.find((x: any) => x.id === s.question_id);
        const correctOption = keyMap.get(s.question_id);
        if (!q || correctOption === undefined || correctOption >= q.options.length || s.option_index >= q.options.length) throw new Error("Invalid answer selection.");
        return { question_id: q.id, correct: s.option_index === correctOption, correct_option: correctOption, explanation: q.explanation };
      });
      const correctCount = results.filter((x) => x.correct).length;
      const questionCount = results.length;
      const accuracy = Math.round((correctCount / questionCount) * 10000) / 100;
      const perCorrect = Number(Deno.env.get("KA_XP_PER_CORRECT"));
      const completionBonus = Number(Deno.env.get("KA_PERFECT_ATTEMPT_BONUS"));
      const dailyCap = Number(Deno.env.get("KA_DAILY_XP_CAP"));
      if (![perCorrect, completionBonus, dailyCap].every(Number.isFinite) || perCorrect < 0 || completionBonus < 0 || dailyCap < 0) {
        return errorResponse(503, "Game XP policy has not been configured by Admin.");
      }
      const today = indiaDate();
      const { data: todayAttempts, error: xpError } = await db.from("ka_attempts")
        .select("xp_awarded").eq("user_id", user.id).gte("completed_at", indiaDayStartIso(today));
      if (xpError) return errorResponse(503, "Could not verify today's XP limit.");
      const xpUsed = (todayAttempts || []).reduce((n: number, x: { xp_awarded: number }) => n + safeNumber(x.xp_awarded), 0);
      const rawXp = correctCount * perCorrect + (correctCount === questionCount ? completionBonus : 0);
      const xpAwarded = Math.max(0, Math.min(rawXp, dailyCap - xpUsed));
      if (challengeId) {
        const { data: challenge, error: challengeError } = await db.from("ka_daily_challenges")
          .select("id,status,challenge_date").eq("id", challengeId).eq("status", "published").maybeSingle();
        if (challengeError || !challenge || challenge.challenge_date !== today) return errorResponse(400, "Daily challenge is not active.");
        const { data: challengeItems, error: challengeItemsError } = await db.from("ka_daily_challenge_items")
          .select("question_id").eq("challenge_id", challengeId);
        if (challengeItemsError || !challengeItems || ids.length !== challengeItems.length || ids.some((id) => !challengeItems.some((x: any) => x.question_id === id))) {
          return errorResponse(400, "Attempt includes questions outside today's challenge.");
        }
      }
      const duration = body.duration_seconds === undefined ? null : safeNumber(body.duration_seconds, -1);
      if (duration !== null && (duration < 0 || duration > 86400)) return errorResponse(400, "Invalid attempt duration.");
      const { data: saved, error: saveError } = await db.rpc("ka_record_attempt", {
        p_user_id: user.id,
        p_game_type: gameType,
        p_subject: subjectSet.size === 1 ? questions[0].subject : "Mixed",
        p_grade_label: ctx.gradeLabel,
        p_challenge_id: challengeId,
        p_question_count: questionCount,
        p_correct_count: correctCount,
        p_accuracy: accuracy,
        p_xp_awarded: Math.floor(xpAwarded),
        p_duration_seconds: duration,
        p_played_on: today,
      });
      if (saveError) {
        console.error("KA attempt persistence failed", saveError);
        return errorResponse(503, "Could not save this attempt.");
      }
      return json(200, {
        attempt: saved,
        question_count: questionCount,
        correct_count: correctCount,
        accuracy,
        xp_awarded: Math.floor(xpAwarded),
        xp_daily_cap: dailyCap,
        feedback: results,
      });
    }

    if (action === "get_my_progress") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const [{ data: stats }, { data: achievements, error }] = await Promise.all([
        db.from("ka_player_stats").select("game_xp,games_played,questions_answered,correct_answers,current_streak,best_streak,last_played_on,updated_at").eq("user_id", user.id).maybeSingle(),
        db.from("ka_player_achievements").select("awarded_at,achievement:ka_achievements(code,title,description,icon)").eq("user_id", user.id).order("awarded_at", { ascending: false }),
      ]);
      if (error) return errorResponse(503, "Could not load achievements.");
      return json(200, { stats: stats || null, achievements: achievements || [] });
    }

    if (action === "get_leaderboard") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const { data, error } = await db.from("ka_player_stats")
        .select("user_id,game_xp,games_played").order("game_xp", { ascending: false }).order("games_played", { ascending: false }).limit(100);
      if (error) return errorResponse(503, "Could not load leaderboard.");
      return json(200, { leaderboard: (data || []).map((x: any, i: number) => ({
        rank: i + 1, display_name: "Player " + (i + 1), game_xp: x.game_xp, games_played: x.games_played,
        is_me: x.user_id === user.id,
      })) });
    }

    if (action === "get_admin_summary") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      return json(200, { summary: await adminSummary(db) });
    }

    if (action === "admin_control") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const control = String(body.control || "");
      const { data: current, error: currentError } = await db.from("ka_settings").select("*").eq("id", 1).maybeSingle();
      if (currentError || !current) return errorResponse(503, "Knowledge Arena settings are not initialised.");
      let patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
      if (control === "set_generation_enabled" || control === "set_games_enabled" || control === "set_daily_challenge_enabled") {
        if (typeof body.enabled !== "boolean") return errorResponse(400, "enabled must be true or false.");
        patch[control.replace("set_", "")] = body.enabled;
      } else if (control === "set_ai_budgets") {
        const daily = safeNumber(body.daily_ai_budget_usd, -1), monthly = safeNumber(body.monthly_ai_budget_usd, -1);
        if (daily < 0 || monthly < 0 || daily > 10000 || monthly > 100000) return errorResponse(400, "AI budget values are invalid.");
        patch.daily_ai_budget_usd = daily; patch.monthly_ai_budget_usd = monthly;
      } else if (control === "set_disabled_game_types" || control === "set_disabled_subjects") {
        if (!Array.isArray(body.values) || body.values.some((x) => typeof x !== "string" || x.length > 100)) return errorResponse(400, "values must be a list of strings.");
        patch[control === "set_disabled_game_types" ? "disabled_game_types" : "disabled_subjects"] = [...new Set(body.values as string[])];
      } else if (control === "pause_job" || control === "resume_job") {
        if (typeof body.job_id !== "string") return errorResponse(400, "job_id is required.");
        const targetStatus = control === "pause_job" ? "paused" : "queued";
        const allowedStatuses = control === "pause_job" ? ["queued"] : ["paused"];
        const { data, error } = await db.from("ka_generation_jobs").update({ status: targetStatus })
          .eq("id", body.job_id).in("status", allowedStatuses).select("id,status").maybeSingle();
        if (error || !data) return errorResponse(409, "Job could not be updated; it may already be running or complete.");
        return json(200, { job: data });
      } else if (control === "queue_generation") {
        if (!current.generation_enabled) return errorResponse(423, "AI generation is paused.");
        const gameType = body.game_type;
        if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
        const difficulty = String(body.difficulty || "medium");
        const requestedCount = safeNumber(body.requested_count, 0);
        const gradeLabel = String(body.grade_label || "").trim();
        const subject = String(body.subject || "").trim();
        if (!["easy", "medium", "hard"].includes(difficulty) || requestedCount < 1 || requestedCount > 20 || !gradeLabel || !subject) return errorResponse(400, "Provide grade, subject, valid difficulty and 1–20 questions.");
        const { data: job, error } = await db.from("ka_generation_jobs").insert({
          status: "queued", subject, topic: String(body.topic || subject).slice(0, 120),
          grade_label: gradeLabel, language_code: String(body.language_code || "en").slice(0, 12),
          game_type: gameType, difficulty, requested_count: requestedCount,
        }).select("id,status,subject,topic,grade_label,language_code,game_type,difficulty,requested_count,created_at").single();
        if (error) return errorResponse(503, "Could not queue the generation job.");
        return json(200, { job });
      } else {
        return errorResponse(400, "Unknown Admin control.");
      }
      const { data, error } = await db.from("ka_settings").update(patch).eq("id", 1)
        .select("generation_enabled,daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects,daily_ai_budget_usd,monthly_ai_budget_usd").single();
      if (error) return errorResponse(503, "Could not update Knowledge Arena settings.");
      return json(200, { settings: data });
    }

    return errorResponse(400, "Unknown Knowledge Arena action.");
  } catch (e) {
    console.error("Knowledge Arena API error", e);
    return errorResponse(500, "Knowledge Arena request failed.");
  }
});
