import { adminClient, authenticate, corsHeaders, errorResponse, indiaDate, indiaDayStartIso, json, studentContext, validGameType, safeNumber } from "../_shared/knowledge-arena.ts";

const MAX_QUESTIONS_PER_ATTEMPT = 30;

function uniqueSubjectNames(rows: Array<{ name: unknown }> | null | undefined): string[] {
  const names = new Map<string, string>();
  for (const row of rows || []) {
    const name = String(row?.name ?? "").trim();
    if (name && !names.has(name.toLocaleLowerCase())) names.set(name.toLocaleLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

async function adminSummary(db: ReturnType<typeof adminClient>) {
  const today = indiaDate();
  const sinceToday = indiaDayStartIso(today);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const monthStart = indiaDayStartIso(today.slice(0, 7) + "-01");
  const [players, attempts, active, questions, accuracies, jobs24, usage24, usageToday, usageMonth, usage30, settings, subjects, grades] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "Student").not("linked_student_id", "is", null),
    db.from("ka_attempts").select("id", { count: "exact", head: true }).gte("completed_at", sinceToday),
    db.from("ka_attempts").select("user_id").gte("completed_at", sinceToday).limit(10000),
    db.from("ka_questions").select("id", { count: "exact", head: true }).eq("status", "published"),
    db.from("ka_attempts").select("accuracy").gte("completed_at", since30d).limit(10000),
    db.from("ka_generation_jobs").select("status,created_at").gte("created_at", since24h),
    db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", since24h),
    db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", sinceToday),
    db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", monthStart),
    db.from("ka_ai_usage").select("status,reserved_cost_inr,actual_cost_inr").gte("created_at", since30d),
    db.from("ka_settings").select("generation_enabled,daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects,daily_ai_budget_inr,monthly_ai_budget_inr").eq("id", 1).maybeSingle(),
    db.from("subjects").select("name").order("name"),
    db.from("grades").select("name").order("name"),
  ]);
  const errors = [players, attempts, active, questions, accuracies, jobs24, usage24, usageToday, usageMonth, usage30, settings, subjects, grades].filter(x => x.error);
  if (errors.length) throw new Error("Could not load the Knowledge Arena summary.");
  const accuracyValues = (accuracies.data || []).map((x: { accuracy: number }) => Number(x.accuracy)).filter(Number.isFinite);
  const average = accuracyValues.length ? accuracyValues.reduce((a: number, b: number) => a + b, 0) / accuracyValues.length : null;
  const usageCost = (rows: any[]) => rows.reduce((n: number, x: any) =>
    n + (x.status === "settled" ? safeNumber(x.actual_cost_inr) : safeNumber(x.reserved_cost_inr)), 0);
  const usageReserved = (rows: any[]) => rows.reduce((n: number, x: any) =>
    n + (x.status === "settled" ? 0 : safeNumber(x.reserved_cost_inr)), 0);
  return {
    registered_players: players.count || 0,
    active_players_today: new Set((active.data || []).map((x: { user_id: string }) => x.user_id)).size,
    games_played_today: attempts.count || 0,
    question_bank_published: questions.count || 0,
    average_accuracy_30d: average === null ? null : Math.round(average * 100) / 100,
    generation_jobs_24h: (jobs24.data || []).length,
    generation_failures_24h: (jobs24.data || []).filter((x: { status: string }) => x.status === "failed").length,
    ai_cost_inr_24h: usageCost(usage24.data || []),
    ai_cost_inr_today: usageCost(usageToday.data || []),
    ai_cost_inr_month: usageCost(usageMonth.data || []),
    ai_cost_inr_30d: usageCost(usage30.data || []),
    ai_cost_inr_reserved_today: usageReserved(usageToday.data || []),
    ai_cost_inr_reserved_month: usageReserved(usageMonth.data || []),
    subjects: uniqueSubjectNames(subjects.data),
    grades: (grades.data || []).map((x: { name: string }) => x.name),
    automation: settings.data || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Use POST.");
  try {
    const auth = await authenticate(req);
    if ("error" in auth) return errorResponse(auth.status ?? 401, auth.error ?? "Authentication failed.");
    const { db, user, profile } = auth;
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorResponse(400, "Invalid JSON request."); }
    const action = String(body.action || "");

    if (action === "get_context") {
      if (profile.role === "Admin") return json(200, { role: "Admin" });
      if (profile.role === "Student") {
        const ctx = await studentContext(db, profile);
        if (!ctx) return errorResponse(403, "A linked LIB student record is required.");
        return json(200, { role: "Student", grade_label: ctx.gradeLabel });
      }
      return errorResponse(403, "Knowledge Arena is available only to LIB Students and Admins.");
    }

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
      let preferredLanguageCode: string | null = null;
      let selectedGradeLabel: string | null = null;
      let availableGradeOptions: string[] = [];
      if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
        const [{ data: preference, error: preferenceError }, { data: grades, error: gradesError }] = await Promise.all([
          db.from("ka_student_preferences").select("selected_grade_label").eq("user_id", user.id).maybeSingle(),
          db.from("grades").select("name").eq("archived", false).order("sort_order"),
        ]);
        if (preferenceError || gradesError) return errorResponse(503, "Could not load your grade options.");
        selectedGradeLabel = preference?.selected_grade_label || null;
        availableGradeOptions = [...new Set((grades || []).map((g: any) => String(g.name || "").trim())
          .filter((name: string) => /^(?:[1-9]|1[0-2]|PU)$/i.test(name)))];
      }
      if (isLanguageStudent) {
        const { data: preference, error: preferenceError } = await db.from("ka_student_preferences")
          .select("preferred_language_code").eq("user_id", user.id).maybeSingle();
        if (preferenceError) return errorResponse(503, "Could not load your saved language preference.");
        preferredLanguageCode = preference?.preferred_language_code || "en";
      }
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
        subjects: uniqueSubjectNames(subjects).filter((s) => !(settings.disabled_subjects || []).includes(s)),
        progress: stats || { game_xp: 0, games_played: 0, questions_answered: 0, correct_answers: 0, current_streak: 0, best_streak: 0 },
        grade_label: selectedGradeLabel || ctx.gradeLabel,
        assigned_grade_label: ctx.gradeLabel,
        selected_grade_label: selectedGradeLabel,
        available_grade_options: availableGradeOptions,
        preferred_language_code: preferredLanguageCode,
      });
    }

    if (action === "set_grade_preference") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      if (ctx.gradeLabel.trim().toLocaleLowerCase() !== "tina student") return errorResponse(403, "Grade selection is available only to Tina Student accounts.");
      const requestedGrade = String(body.grade_label || "").trim();
      if (!/^(?:[1-9]|1[0-2]|PU)$/i.test(requestedGrade)) return errorResponse(400, "Choose a school grade from 1 to 12 or PU.");
      const { data: knownGrade, error: gradeError } = await db.from("grades").select("name").eq("name", requestedGrade).eq("archived", false).maybeSingle();
      if (gradeError || !knownGrade) return errorResponse(400, "That grade is not available in Grade Setup.");
      const { error } = await db.from("ka_student_preferences").upsert({
        user_id: user.id, selected_grade_label: knownGrade.name, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) return errorResponse(503, "Could not save your grade preference.");
      return json(200, { grade_label: knownGrade.name });
    }

    if (action === "set_language_preference") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      if (ctx.gradeLabel.trim().toLocaleLowerCase() !== "language") return errorResponse(403, "Language preference is available only to Language-category students.");
      const languageCode = String(body.language_code || "");
      if (!["en", "hi", "kn", "sa", "fr"].includes(languageCode)) return errorResponse(400, "Choose English, Hindi, Kannada, Sanskrit or French.");
      const { error } = await db.from("ka_student_preferences").upsert({
        user_id: user.id, preferred_language_code: languageCode, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) return errorResponse(503, "Could not save your language preference.");
      return json(200, { language_code: languageCode });
    }

    if (action === "get_questions") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const gameType = body.game_type;
      if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
      let subject = typeof body.subject === "string" ? body.subject.trim() : "";
      const isLanguageStudent = ctx.gradeLabel.trim().toLocaleLowerCase() === "language";
      // Enforce game-to-subject routing on the server as well as in the UI.
      // Quick Quiz may intentionally load across all subjects.
      if (!isLanguageStudent) {
        const gameSubjects: Record<string, string> = {
          word_master: "English",
          number_quest: "Math",
          brain_teaser: "Math",
          science_explorer: "Science",
          memory_challenge: "Science",
        };
        if (gameSubjects[gameType]) subject = gameSubjects[gameType];
        else if (subject.toLocaleLowerCase() === "all") subject = "";
      }
      if (!subject && gameType !== "quick_quiz") return errorResponse(400, "A subject is required for this game.");
      let effectiveGradeLabel = ctx.gradeLabel;
      if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
        const { data: preference, error: preferenceError } = await db.from("ka_student_preferences")
          .select("selected_grade_label").eq("user_id", user.id).maybeSingle();
        if (preferenceError) return errorResponse(503, "Could not verify your saved grade.");
        if (!preference?.selected_grade_label) return errorResponse(400, "Please select your school grade first.");
        effectiveGradeLabel = preference.selected_grade_label;
      }
      const difficulty = body.difficulty === undefined ? "" : String(body.difficulty);
      let languageCode = body.language_code === undefined ? "" : String(body.language_code);
      if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) return errorResponse(400, "Invalid difficulty.");
      if (languageCode && !["en","hi","kn","sa","fr"].includes(languageCode)) return errorResponse(400, "Invalid question language.");
      if (ctx.gradeLabel.trim().toLocaleLowerCase() === "language") {
        const { data: preference, error: preferenceError } = await db.from("ka_student_preferences")
          .select("preferred_language_code").eq("user_id", user.id).maybeSingle();
        if (preferenceError) return errorResponse(503, "Could not verify your saved language preference.");
        const savedCode = preference?.preferred_language_code || "en";
        const languageNames: Record<string, string> = { en: "English", hi: "Hindi", kn: "Kannada", sa: "Sanskrit", fr: "French" };
        if (languageCode && languageCode !== savedCode) return errorResponse(403, "Your selected language does not match your saved preference.");
        if (subject !== languageNames[savedCode]) return errorResponse(403, "Choose your saved language before starting Word Master.");
        languageCode = savedCode;
      }
      const { data: settings } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!settings?.games_enabled || (settings.disabled_game_types || []).includes(gameType)) return errorResponse(423, "This game is currently unavailable.");
      if (subject && (settings.disabled_subjects || []).includes(subject)) return errorResponse(423, "This subject is currently unavailable.");
      let query = db.from("ka_questions")
        .select("id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options")
        .eq("status", "published").in("grade_label", [effectiveGradeLabel, "General"]).eq("game_type", gameType)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .order("created_at", { ascending: false }).limit(Math.min(Math.max(safeNumber(body.limit, 10), 1), 20));
      if (subject) query = query.eq("subject", subject);
      if (difficulty) query = query.eq("difficulty", difficulty);
      if (languageCode) query = query.eq("language_code", languageCode);
      const { data, error } = await query;
      if (error) return errorResponse(503, "Could not load questions.");
      return json(200, { questions: data || [], grade_label: effectiveGradeLabel });
    }

    if (action === "get_daily_challenge") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const today = indiaDate();
      const { data: dailySettings } = await db.from("ka_settings")
        .select("daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!dailySettings?.daily_challenge_enabled || !dailySettings.games_enabled) return json(200, { challenge: null, paused: true });
      const { data: challenge, error } = await db.from("ka_daily_challenges")
        .select("id,challenge_date,grade_label,title,description,status")
        .eq("challenge_date", today).eq("grade_label", ctx.gradeLabel).eq("status", "published").maybeSingle();
      if (error) return errorResponse(503, "Could not load today's challenge.");
      if (!challenge) return json(200, { challenge: null });
      const { data: items, error: itemError } = await db.from("ka_daily_challenge_items")
        .select("sort_order,question:ka_questions(id,subject,topic,grade_label,language_code,difficulty,game_type,status,expires_at,prompt,options)")
        .eq("challenge_id", challenge.id).order("sort_order");
      if (itemError) return errorResponse(503, "Could not load today's challenge questions.");
      const questions = (items || []).map((x: { question: any }) => x.question)
        .filter((q: any) => q && q.status === "published" && (!q.expires_at || Date.parse(q.expires_at) > Date.now()) && q.grade_label === ctx.gradeLabel &&
          !(dailySettings.disabled_game_types || []).includes(q.game_type) &&
          !(dailySettings.disabled_subjects || []).includes(q.subject));
      if (questions.length !== 10) return json(200, { challenge: null, questions: [], unavailable: true });
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
      let effectiveGradeLabel = ctx.gradeLabel;
      if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
        const { data: preference, error: preferenceError } = await db.from("ka_student_preferences")
          .select("selected_grade_label").eq("user_id", user.id).maybeSingle();
        if (preferenceError) return errorResponse(503, "Could not verify your saved grade.");
        if (!preference?.selected_grade_label) return errorResponse(400, "Please select your school grade first.");
        effectiveGradeLabel = preference.selected_grade_label;
      }
      const { data: questions, error: questionError } = await db.from("ka_questions")
        .select("id,subject,topic,grade_label,difficulty,game_type,prompt,options,explanation")
        .in("id", ids).eq("status", "published").in("grade_label", [effectiveGradeLabel, "General"])
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
      if (questionError || !questions || questions.length !== ids.length) return errorResponse(400, "One or more questions are unavailable.");
      const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : null;
      if (questions.some((q: any) => q.game_type !== gameType)) return errorResponse(400, "Questions do not match the selected game.");
      const subjectSet = new Set(questions.map((q: any) => q.subject));
      if (!challengeId && subjectSet.size !== 1) return errorResponse(400, "A practice attempt must contain questions from one subject.");
      const { data: gameSettings } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!gameSettings?.games_enabled ||
          questions.some((q: any) => (gameSettings.disabled_game_types || []).includes(q.game_type)) ||
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
      const perCorrect = safeNumber(Deno.env.get("KA_XP_PER_CORRECT"), 5);
      const completionBonus = safeNumber(Deno.env.get("KA_PERFECT_ATTEMPT_BONUS"), 10);
      const dailyCap = Math.floor(safeNumber(Deno.env.get("KA_DAILY_XP_CAP"), 100));
      if (![perCorrect, completionBonus, dailyCap].every(Number.isFinite) || perCorrect < 0 || completionBonus < 0 || dailyCap < 0) {
        return errorResponse(503, "Game XP policy has not been configured by Admin.");
      }
      const today = indiaDate();
      const requestedXp = Math.floor(correctCount * perCorrect + (correctCount === questionCount ? completionBonus : 0));
      if (challengeId) {
        const { data: challenge, error: challengeError } = await db.from("ka_daily_challenges")
          .select("id,status,challenge_date,grade_label").eq("id", challengeId).eq("status", "published").maybeSingle();
        if (challengeError || !challenge || challenge.challenge_date !== today || challenge.grade_label !== ctx.gradeLabel) return errorResponse(400, "Daily challenge is not active for this grade.");
        const { data: challengeItems, error: challengeItemsError } = await db.from("ka_daily_challenge_items")
          .select("question_id,question:ka_questions(grade_label)").eq("challenge_id", challengeId);
        const eligibleItems = (challengeItems || []).filter((x: any) => x.question &&
          x.question.grade_label === ctx.gradeLabel);
        if (challengeItemsError || !challengeItems || ids.length !== eligibleItems.length || ids.some((id) => !eligibleItems.some((x: any) => x.question_id === id))) {
          return errorResponse(400, "Attempt includes questions outside today's challenge.");
        }
      }
      const duration = body.duration_seconds === undefined ? null : safeNumber(body.duration_seconds, -1);
      if (duration !== null && (duration < 0 || duration > 86400)) return errorResponse(400, "Invalid attempt duration.");
      const clientAttemptId = String(body.client_attempt_id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientAttemptId)) {
        return errorResponse(400, "A valid client attempt ID is required.");
      }
      const { data: saved, error: saveError } = await db.rpc("ka_record_attempt", {
        p_user_id: user.id,
        p_client_attempt_id: clientAttemptId,
        p_game_type: gameType,
        p_subject: subjectSet.size === 1 ? questions[0].subject : "Mixed",
        p_grade_label: effectiveGradeLabel,
        p_challenge_id: challengeId,
        p_question_count: questionCount,
        p_correct_count: correctCount,
        p_accuracy: accuracy,
        p_requested_xp: requestedXp,
        p_daily_xp_cap: dailyCap,
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
        xp_awarded: safeNumber(saved?.xp_awarded),
        xp_daily_cap: dailyCap,
        feedback: results,
      });
    }

    if (action === "get_my_progress") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      const [{ data: stats, error: statsError }, { data: awards, error: awardsError }, { data: allAchievements, error: allError }] = await Promise.all([
        db.from("ka_player_stats").select("game_xp,games_played,questions_answered,correct_answers,current_streak,best_streak,last_played_on,updated_at").eq("user_id", user.id).maybeSingle(),
        db.from("ka_player_achievements").select("awarded_at,achievement:ka_achievements(code)").eq("user_id", user.id).order("awarded_at", { ascending: false }),
        db.from("ka_achievements").select("code,title,description,icon,rule").eq("active", true).order("sort_order"),
      ]);
      if (statsError || awardsError || allError) return errorResponse(503, "Could not load achievements.");
      const unlocked = new Map((awards || []).map((x: any) => [x.achievement?.code, x.awarded_at]));
      return json(200, {
        stats: stats || null,
        achievements: (allAchievements || []).map((x: any) => ({
          code: x.code, title: x.title, description: x.description, icon: x.icon,
          unlocked: unlocked.has(x.code), awarded_at: unlocked.get(x.code) || null,
        })),
      });
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

    if (action === "get_admin_leadership") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const { data: stats, error: statsError } = await db.from("ka_player_stats")
        .select("user_id,game_xp,games_played,questions_answered,correct_answers,current_streak,best_streak,last_played_on")
        .order("game_xp", { ascending: false }).order("games_played", { ascending: false }).limit(100);
      if (statsError) return errorResponse(503, "Could not load Knowledge Arena leadership data.");
      const userIds = (stats || []).map((x: any) => x.user_id);
      const { data: profiles, error: profileError } = userIds.length
        ? await db.from("profiles").select("id,linked_student_id").eq("role", "Student").eq("archived", false).not("linked_student_id", "is", null).in("id", userIds)
        : { data: [], error: null };
      if (profileError) return errorResponse(503, "Could not load student profile links.");
      const studentIds = [...new Set((profiles || []).map((x: any) => x.linked_student_id).filter(Boolean))];
      const [{ data: students, error: studentError }, { data: awards, error: awardsError }] = await Promise.all([
        studentIds.length
          ? db.from("students").select("id,name,student_code,grade_id").eq("archived", false).in("id", studentIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? db.from("ka_player_achievements").select("user_id,achievement_id").in("user_id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (studentError || awardsError) return errorResponse(503, "Could not load student leadership details.");
      const gradeIds = [...new Set((students || []).map((x: any) => x.grade_id).filter(Boolean))];
      const { data: grades, error: gradeError } = gradeIds.length
        ? await db.from("grades").select("id,name").in("id", gradeIds)
        : { data: [], error: null };
      if (gradeError) return errorResponse(503, "Could not load student grade labels.");
      const profileByUser = new Map((profiles || []).map((x: any) => [x.id, x]));
      const studentById = new Map((students || []).map((x: any) => [x.id, x]));
      const gradeById = new Map((grades || []).map((x: any) => [x.id, x.name]));
      const awardCounts = new Map<string, number>();
      for (const award of awards || []) awardCounts.set(award.user_id, (awardCounts.get(award.user_id) || 0) + 1);
      const eligibleStats = (stats || []).filter((x: any) => {
        const profile = profileByUser.get(x.user_id);
        return !!(profile?.linked_student_id && studentById.has(profile.linked_student_id));
      });
      const players = eligibleStats.map((x: any, index: number) => {
        const profile = profileByUser.get(x.user_id);
        const student = profile?.linked_student_id ? studentById.get(profile.linked_student_id) : null;
        const questions = Number(x.questions_answered || 0);
        return {
          rank: index + 1,
          student_name: student?.name || "Linked student",
          student_code: student?.student_code || "",
          grade_label: student?.grade_id ? gradeById.get(student.grade_id) || "Grade not set" : "Grade not set",
          game_xp: Number(x.game_xp || 0),
          game_level: Math.floor(Number(x.game_xp || 0) / 100) + 1,
          games_played: Number(x.games_played || 0),
          questions_answered: questions,
          correct_answers: Number(x.correct_answers || 0),
          accuracy_percent: questions ? Math.round((Number(x.correct_answers || 0) / questions) * 1000) / 10 : 0,
          current_streak: Number(x.current_streak || 0),
          best_streak: Number(x.best_streak || 0),
          achievements_earned: awardCounts.get(x.user_id) || 0,
          last_played_on: x.last_played_on || null,
        };
      });
      return json(200, {
        summary: {
          game_players: players.length,
          game_xp_total: players.reduce((n: number, x: any) => n + x.game_xp, 0),
          game_achievements_total: players.reduce((n: number, x: any) => n + x.achievements_earned, 0),
        },
        players,
        attendance_rewards: {
          status: "not_integrated",
          message: "Attendance XP, levels, badges, streaks and attendance leaderboard remain in the existing LIB attendance system. This dashboard does not recalculate or modify those rewards.",
        },
      });
    }

    if (action === "get_admin_options") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const [{ data: grades, error: gradeError }, { data: subjects, error: subjectError }] = await Promise.all([
        db.from("grades").select("name").order("name"),
        db.from("subjects").select("name").order("name"),
      ]);
      if (gradeError || subjectError) return errorResponse(503, "Could not load grade and subject options.");
      return json(200, {
        grades: [...new Set(["General", ...(grades || []).map((x: any) => String(x.name))])],
        subjects: uniqueSubjectNames(subjects),
        game_types: ["word_master","number_quest","science_explorer","quick_quiz","brain_teaser","memory_challenge"],
      });
    }

    if (action === "get_admin_usage_reviews") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const { data: usageRows, error } = await db.from("ka_ai_usage")
        .select("id,job_id,status,reserved_cost_inr,actual_cost_inr,usd_inr_rate,input_tokens,output_tokens,created_at")
        .eq("status", "review").order("created_at", { ascending: true }).limit(100);
      if (error) return errorResponse(503, "Could not load AI usage reservations for review.");
      const jobIds = [...new Set((usageRows || []).map((x: any) => x.job_id))];
      const { data: jobs, error: jobError } = jobIds.length
        ? await db.from("ka_generation_jobs").select("id,subject,grade_label,game_type,status,error_code").in("id", jobIds)
        : { data: [], error: null };
      if (jobError) return errorResponse(503, "Could not load generation job summaries.");
      const jobMap = new Map((jobs || []).map((x: any) => [x.id, x]));
      return json(200, { reviews: (usageRows || []).map((x: any) => ({ ...x, job: jobMap.get(x.job_id) || null })) });
    }

    if (action === "get_admin_jobs") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const { data, error } = await db.from("ka_generation_jobs")
        .select("id,status,subject,topic,grade_label,language_code,game_type,difficulty,requested_count,published_count,created_at,started_at,completed_at,error_code,error_summary,estimated_cost_inr")
        .order("created_at", { ascending: false }).limit(50);
      if (error) return errorResponse(503, "Could not load generation jobs.");
      return json(200, { jobs: data || [] });
    }

    if (action === "admin_control") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const control = String(body.control || "");
      if (control === "publish_daily_challenge") {
        const { data: result, error: publishError } = await db.rpc("ka_publish_daily_challenges", { p_challenge_date: indiaDate() });
        if (publishError) return errorResponse(503, "Could not publish today's daily challenge.");
        return json(200, { publication: result });
      }
      const { data: current, error: currentError } = await db.from("ka_settings").select("*").eq("id", 1).maybeSingle();
      if (currentError || !current) return errorResponse(503, "Knowledge Arena settings are not initialised.");
      let patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
      if (control === "set_generation_enabled" || control === "set_games_enabled" || control === "set_daily_challenge_enabled") {
        if (typeof body.enabled !== "boolean") return errorResponse(400, "enabled must be true or false.");
        patch[control.replace("set_", "")] = body.enabled;
      } else if (control === "set_ai_budgets") {
        const daily = safeNumber(body.daily_ai_budget_inr, -1), monthly = safeNumber(body.monthly_ai_budget_inr, -1);
        if (daily < 0 || monthly < 0 || daily > 100000 || monthly > 1000000 || daily > monthly) return errorResponse(400, "AI budgets must be non-negative INR amounts, within supported maximums, and daily cannot exceed monthly.");
        patch.daily_ai_budget_inr = daily; patch.monthly_ai_budget_inr = monthly;
      } else if (control === "set_disabled_game_types" || control === "set_disabled_subjects") {
        if (!Array.isArray(body.values) || body.values.some((x) => typeof x !== "string" || x.length > 100)) return errorResponse(400, "values must be a list of strings.");
        const values = [...new Set(body.values as string[])];
        if (control === "set_disabled_game_types" && values.some((x) => !validGameType(x))) return errorResponse(400, "One or more game types are invalid.");
        if (control === "set_disabled_subjects" && values.length) {
          const { data: knownSubjects, error: subjectError } = await db.from("subjects").select("name").in("name", values);
          if (subjectError || (knownSubjects || []).length !== values.length) return errorResponse(400, "One or more subjects are invalid.");
        }
        patch[control === "set_disabled_game_types" ? "disabled_game_types" : "disabled_subjects"] = values;
      } else if (control === "resolve_usage_review") {
        const usageId = typeof body.usage_id === "string" ? body.usage_id : "";
        const actualCostInr = safeNumber(body.actual_cost_inr, -1);
        if (!usageId || !Number.isFinite(actualCostInr) || actualCostInr < 0 || actualCostInr > 1000000) {
          return errorResponse(400, "Provide a valid usage reservation and confirmed actual INR cost.");
        }
        const { data: usageRow, error: usageReadError } = await db.from("ka_ai_usage")
          .select("id,status,usd_inr_rate").eq("id", usageId).eq("status", "review").maybeSingle();
        if (usageReadError || !usageRow) return errorResponse(409, "This AI usage reservation is no longer awaiting review.");
        const fxRate = safeNumber(usageRow.usd_inr_rate, 0);
        if (fxRate <= 0) return errorResponse(409, "The recorded exchange rate is invalid; reservation cannot be settled.");
        const { data: settled, error: settleError } = await db.from("ka_ai_usage").update({
          status: "settled", actual_cost_inr: actualCostInr, actual_cost_usd: actualCostInr / fxRate,
          settled_at: new Date().toISOString(),
        }).eq("id", usageId).eq("status", "review").select("id,status,actual_cost_inr").maybeSingle();
        if (settleError || !settled) return errorResponse(409, "Could not settle the AI usage reservation.");
        return json(200, { usage: settled });
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
        const languageCode = String(body.language_code || "en");
        if (!["easy", "medium", "hard"].includes(difficulty) || !["en","hi","kn","sa","fr"].includes(languageCode) || requestedCount < 1 || requestedCount > 20 || !gradeLabel || !subject) return errorResponse(400, "Provide grade, subject, supported language, valid difficulty and 1–20 questions.");
        if ((current.disabled_game_types || []).includes(gameType) || (current.disabled_subjects || []).includes(subject)) return errorResponse(423, "This game or subject is disabled.");
        if (gradeLabel !== "General") {
          const { data: grade } = await db.from("grades").select("name").eq("name", gradeLabel).maybeSingle();
          if (!grade) return errorResponse(400, "Unknown grade label.");
        }
        const { data: subjectRow } = await db.from("subjects").select("name").eq("name", subject).maybeSingle();
        if (!subjectRow) return errorResponse(400, "Unknown subject.");
        const { data: job, error } = await db.from("ka_generation_jobs").insert({
          status: "queued", subject, topic: String(body.topic || subject).slice(0, 120),
          grade_label: gradeLabel, language_code: languageCode,
          game_type: gameType, difficulty, requested_count: requestedCount,
        }).select("id,status,subject,topic,grade_label,language_code,game_type,difficulty,requested_count,created_at").single();
        if (error) return errorResponse(503, "Could not queue the generation job.");
        return json(200, { job });
      } else {
        return errorResponse(400, "Unknown Admin control.");
      }
      const { data, error } = await db.from("ka_settings").update(patch).eq("id", 1)
        .select("generation_enabled,daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects,daily_ai_budget_inr,monthly_ai_budget_inr").single();
      if (error) return errorResponse(503, "Could not update Knowledge Arena settings.");
      return json(200, { settings: data });
    }

    return errorResponse(400, "Unknown Knowledge Arena action.");
  } catch (e) {
    console.error("Knowledge Arena API error", e);
    return errorResponse(500, "Knowledge Arena request failed.");
  }
});
