import { adminClient, authenticate, corsHeaders, errorResponse, indiaDate, indiaDayStartIso, json, studentContext, validGameType, safeNumber, GAME_CATALOG, gameSubjects } from "../_shared/knowledge-arena.ts";

const MAX_QUESTIONS_PER_ATTEMPT = 30;

async function playerGrade(db: ReturnType<typeof adminClient>, profile: any, userId: string, requestedGrade?: unknown) {
  if (profile.role === "Student") {
    const ctx = await studentContext(db, profile);
    if (!ctx) return null;
    if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
      const { data: preference, error } = await db.from("ka_student_preferences")
        .select("selected_grade_label").eq("user_id", userId).maybeSingle();
      if (error) throw new Error("Could not verify your saved grade.");
      return preference?.selected_grade_label ? { gradeLabel: preference.selected_grade_label, assignedGradeLabel: ctx.gradeLabel } : null;
    }
    return { gradeLabel: ctx.gradeLabel, assignedGradeLabel: ctx.gradeLabel };
  }
  if (profile.role !== "Teacher" && profile.role !== "Admin") return null;
  const label = String(requestedGrade || "").trim();
  if (!label) return null;
  const { data: grade, error } = await db.from("grades").select("name").eq("name", label).eq("archived", false).maybeSingle();
  if (error || !grade) return null;
  return { gradeLabel: grade.name, assignedGradeLabel: null };
}

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


const GUEST_SESSION_DAYS = 30;
const GUEST_STATUSES = ["New","Contacted","Interested","Demo Booked","Demo Completed","Converted to Student","Not Interested"];

function normalizeGuestMobile(value: unknown): string | null {
  const digits = String(value || "").replace(/\\D/g, "");
  const national = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\\d{9}$/.test(national) ? "+91" + national : null;
}
async function guestTokenHash(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function guestToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function getGuestSession(db: ReturnType<typeof adminClient>, token: unknown) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
  const hash = await guestTokenHash(token);
  const { data, error } = await db.from("ka_guest_sessions")
    .select("id,lead_id,guest_name,grade_label,expires_at,ended_at")
    .eq("session_token_hash", hash).is("ended_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  await db.from("ka_guest_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  await db.from("ka_guest_leads").update({ last_seen_at: new Date().toISOString() }).eq("id", data.lead_id);
  return data;
}
async function handleGuestAction(db: ReturnType<typeof adminClient>, body: Record<string, unknown>) {
  const action = String(body.action || "");
  if (action === "guest_register") {
    const name = String(body.guest_name || "").trim().replace(/\\s+/g, " ");
    const mobile = normalizeGuestMobile(body.mobile_number);
    const grade = String(body.grade_label || "").trim();
    if (name.length < 2 || name.length > 80) return errorResponse(400, "Enter a name between 2 and 80 characters.");
    if (!mobile) return errorResponse(400, "Enter a valid 10-digit Indian mobile number.");
    if (!grade || grade.length > 80) return errorResponse(400, "Select your grade.");
    const [{ data: gradeRow, error: gradeError }, { data: existing, error: leadReadError }] = await Promise.all([
      db.from("grades").select("name").eq("name", grade).eq("archived", false).maybeSingle(),
      db.from("ka_guest_leads").select("id,enquiry_consent,marketing_consent").eq("mobile_e164", mobile).maybeSingle()
    ]);
    if (gradeError || leadReadError) return errorResponse(503, "Guest registration is temporarily unavailable.");
    if (!gradeRow) return errorResponse(400, "Select a valid grade.");
    const now = new Date().toISOString();
    const { data: lead, error: leadError } = await db.from("ka_guest_leads").upsert({
      mobile_e164: mobile, last_seen_at: now, updated_at: now,
      enquiry_consent: !!existing?.enquiry_consent || body.enquiry_consent === true,
      marketing_consent: !!existing?.marketing_consent || body.marketing_consent === true
    }, { onConflict: "mobile_e164" }).select("id").single();
    if (leadError || !lead) return errorResponse(503, "Could not save the guest lead.");
    const token = guestToken();
    const expires = new Date(Date.now() + GUEST_SESSION_DAYS * 86400000).toISOString();
    const { data: session, error: sessionError } = await db.from("ka_guest_sessions").insert({
      lead_id: lead.id, session_token_hash: await guestTokenHash(token), guest_name: name,
      grade_label: grade, expires_at: expires
    }).select("id,guest_name,grade_label,expires_at").single();
    if (sessionError || !session) return errorResponse(503, "Could not start the guest session.");
    await db.from("ka_guest_leads").update({ last_guest_name: name, last_grade_label: grade }).eq("id", lead.id);
    const consentEvents = [];
    if (body.enquiry_consent === true) consentEvents.push({ lead_id: lead.id, session_id: session.id, consent_type: "enquiry", granted: true, source: "knowledge_arena_guest" });
    if (body.marketing_consent === true) consentEvents.push({ lead_id: lead.id, session_id: session.id, consent_type: "whatsapp_marketing", granted: true, source: "knowledge_arena_guest" });
    if (consentEvents.length) {
      const { error } = await db.from("ka_guest_consents").insert(consentEvents);
      if (error) return errorResponse(503, "Could not record consent. Registration was not completed.");
    }
    return json(200, { guest_token: token, session_id: session.id, guest_name: name, grade_label: grade, expires_at: expires, returning_lead: !!existing });
  }
  const guest = await getGuestSession(db, body.guest_token);
  if (!guest) return errorResponse(401, "Guest session expired. Please register again.");
  if (action === "guest_resume") return json(200, { session_id: guest.id, guest_name: guest.guest_name, grade_label: guest.grade_label, expires_at: guest.expires_at });
  if (action === "guest_catalog") {
    const [{ data: settings, error: settingsError }, { data: subjects, error: subjectError }] = await Promise.all([
      db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle(),
      db.from("subjects").select("name").order("name")
    ]);
    if (settingsError || subjectError || !settings) return errorResponse(503, "Knowledge Arena is not configured.");
    const { data: gradeGame, error: gradeGameError } = await db.from("ka_game_grade_rules").select("game_type,enabled").eq("grade_label", guest.grade_label).eq("enabled", true);
    if (gradeGameError) return errorResponse(503, "Could not load games for this grade.");
    const available = new Set((gradeGame || []).map((x: any) => x.game_type));
    const games = GAME_CATALOG.filter((g) => settings.games_enabled && available.has(g.id) && !(settings.disabled_game_types || []).includes(g.id));
    return json(200, { games, subjects: uniqueSubjectNames(subjects).filter((s) => !(settings.disabled_subjects || []).includes(s)), grade_label: guest.grade_label });
  }
  if (action === "guest_questions") {
    const gameType = body.game_type;
    if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
    const { data: settings, error: settingsError } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
    if (settingsError || !settings?.games_enabled || (settings.disabled_game_types || []).includes(gameType)) return errorResponse(423, "This game is currently unavailable.");
    const [{ data: gradeGame }, { data: gradeSubjects }, { data: gameSubjectRows }, { data: allSubjects }] = await Promise.all([
      db.from("ka_game_grade_rules").select("enabled").eq("game_type", gameType).eq("grade_label", guest.grade_label).maybeSingle(),
      db.from("ka_grade_subject_rules").select("subject").eq("grade_label", guest.grade_label).eq("enabled", true),
      db.from("ka_game_subject_rules").select("subject").eq("game_type", gameType).eq("enabled", true),
      db.from("subjects").select("name").order("name")
    ]);
    if (!gradeGame?.enabled) return errorResponse(423, "This game is not available for the selected grade.");
    const eligible = new Set((gradeSubjects || []).map((x: any) => String(x.subject).toLowerCase()));
    const mapped = new Set((gameSubjectRows || []).map((x: any) => String(x.subject).toLowerCase()));
    const allowed = gameSubjects(gameType, uniqueSubjectNames(allSubjects).filter((s) => !(settings.disabled_subjects || []).includes(s)))
      .filter((s) => eligible.has(s.toLowerCase()) && mapped.has(s.toLowerCase()));
    if (!allowed.length) return json(200, { questions: [], grade_label: guest.grade_label });
    const { data: questions, error } = await db.from("ka_questions")
      .select("id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options")
      .eq("status", "published").eq("game_type", gameType).in("subject", allowed)
      .in("grade_label", [guest.grade_label, "General"])
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("created_at", { ascending: false }).limit(10);
    if (error) return errorResponse(503, "Could not load questions.");
    return json(200, { questions: questions || [], grade_label: guest.grade_label });
  }
  if (action === "guest_submit") {
    const gameType = body.game_type;
    const answers = body.answers;
    if (!validGameType(gameType) || !Array.isArray(answers) || answers.length < 1 || answers.length > MAX_QUESTIONS_PER_ATTEMPT) return errorResponse(400, "Invalid game submission.");
    const ids = [...new Set(answers.map((x: any) => x?.question_id).filter((x: any) => typeof x === "string"))];
    if (ids.length !== answers.length || answers.some((x: any) => !Number.isInteger(x.option_index) || x.option_index < 0)) return errorResponse(400, "Answer format is invalid.");
    const { data: questions, error: qError } = await db.from("ka_questions")
      .select("id,subject,grade_label,game_type,options,explanation")
      .in("id", ids).eq("status", "published").eq("game_type", gameType)
      .in("grade_label", [guest.grade_label, "General"])
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
    if (qError || !questions || questions.length !== ids.length) return errorResponse(400, "One or more questions are unavailable.");
    const subjects = [...new Set(questions.map((q: any) => q.subject))];
    const [{ data: keys, error: keyError }, { data: settings }] = await Promise.all([
      db.from("ka_question_keys").select("question_id,correct_option").in("question_id", ids),
      db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle()
    ]);
    if (keyError || !keys || keys.length !== ids.length) return errorResponse(503, "Answer validation is unavailable.");
    if (!settings?.games_enabled || (settings.disabled_game_types || []).includes(gameType) || subjects.some((s) => (settings.disabled_subjects || []).includes(s))) return errorResponse(423, "This game is currently unavailable.");
    const keyMap = new Map(keys.map((x: any) => [x.question_id, Number(x.correct_option)]));
    const feedback = answers.map((answer: any) => {
      const q = questions.find((x: any) => x.id === answer.question_id);
      const correctOption = keyMap.get(answer.question_id);
      if (!q || correctOption === undefined || answer.option_index >= q.options.length) throw new Error("Invalid answer.");
      return { question_id: q.id, correct: answer.option_index === correctOption, correct_option: correctOption, explanation: q.explanation };
    });
    const correct = feedback.filter((x) => x.correct).length;
    const now = new Date().toISOString();
    const { error: activityError } = await db.from("ka_guest_activity").insert({
      lead_id: guest.lead_id, session_id: guest.id, game_type: gameType, subject: subjects.join(", "),
      question_count: answers.length, correct_count: correct, accuracy: Math.round(correct / answers.length * 10000) / 100,
      duration_seconds: Math.max(0, Math.min(3600, safeNumber(body.duration_seconds, 0))), completed_at: now
    });
    if (activityError) return errorResponse(503, "Could not save guest activity.");
    await db.from("ka_guest_sessions").update({
      games_completed: 1, questions_answered: answers.length, last_game_type: gameType, last_subject: subjects.join(", "), last_seen_at: now
    }).eq("id", guest.id);
    await db.from("ka_guest_leads").update({
      games_completed: 1, questions_answered: answers.length, last_game_type: gameType, last_subject: subjects.join(", "), last_activity_at: now, last_seen_at: now
    }).eq("id", guest.lead_id);
    return json(200, { correct_count: correct, question_count: answers.length, accuracy: Math.round(correct / answers.length * 10000) / 100, feedback });
  }
  if (action === "guest_promotions") {
    const trigger = String(body.trigger || "after_game");
    if (!["welcome","after_game","exit"].includes(trigger)) return errorResponse(400, "Invalid promotion trigger.");
    const { data, error } = await db.from("ka_guest_promotions").select("id,title,body,image_url,cta_label,cta_url,trigger,display_order")
      .eq("active", true).eq("trigger", trigger).or("starts_at.is.null,starts_at.lte." + new Date().toISOString())
      .or("ends_at.is.null,ends_at.gt." + new Date().toISOString()).order("display_order").limit(10);
    if (error) return errorResponse(503, "Could not load promotions.");
    return json(200, { promotions: (data || []).filter((p: any) =>
      (!p.target_grades?.length || p.target_grades.includes(guest.grade_label)) &&
      (!p.target_game_types?.length || p.target_game_types.includes(String(body.game_type || ""))) &&
      (!p.target_subjects?.length || p.target_subjects.includes(String(body.subject || "")))) });
  }
  if (action === "guest_promotion_event") {
    const promotionId = String(body.promotion_id || "");
    const eventType = String(body.event_type || "");
    if (!promotionId || !["view","click","dismiss"].includes(eventType)) return errorResponse(400, "Invalid promotion event.");
    const { error } = await db.from("ka_guest_promotion_events").insert({ lead_id: guest.lead_id, session_id: guest.id, promotion_id: promotionId, event_type: eventType });
    if (error) return errorResponse(503, "Could not record promotion activity.");
    return json(200, { recorded: true });
  }
  return errorResponse(400, "Unknown guest action.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse(405, "Use POST.");
  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorResponse(400, "Invalid JSON request."); }
    const action = String(body.action || "");
    const db = adminClient();
    if (action.startsWith("guest_")) return await handleGuestAction(db, body);
    const auth = await authenticate(req);
    if ("error" in auth) return errorResponse(auth.status ?? 401, auth.error ?? "Authentication failed.");
    const { user, profile } = auth;

    if (action === "get_context") {
      if (profile.role === "Admin") return json(200, { role: "Admin" });
      if (profile.role === "Teacher") return json(200, { role: "Teacher" });
      if (profile.role === "Student") {
        const ctx = await studentContext(db, profile);
        if (!ctx) return errorResponse(403, "A linked LIB student record is required.");
        return json(200, { role: "Student", grade_label: ctx.gradeLabel });
      }
      return errorResponse(403, "Knowledge Arena is available to linked LIB Students, Teachers and authorised Admins.");
    }

    if (action === "get_catalog") {
      const resolved = await playerGrade(db, profile, user.id, body.grade_label);
      const [{ data: settings, error: settingsError }, { data: subjects, error: subjectsError },
        { data: stats }, { data: grades, error: gradesError }] = await Promise.all([
        db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle(),
        db.from("subjects").select("name").order("name"),
        db.from("ka_player_stats").select("game_xp,games_played,questions_answered,correct_answers,current_streak,best_streak,last_played_on").eq("user_id", user.id).maybeSingle(),
        db.from("grades").select("name").eq("archived", false).order("sort_order"),
      ]);
      if (settingsError || subjectsError || gradesError || !settings) return errorResponse(503, "Knowledge Arena is not configured yet.");
      let selectedGradeLabel: string | null = resolved?.gradeLabel || null;
      let assignedGradeLabel: string | null = null;
      let availableGradeOptions: string[] = [];
      let preferredLanguageCode: string | null = null;
      if (profile.role === "Student") {
        const ctx = await studentContext(db, profile);
        if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
        assignedGradeLabel = ctx.gradeLabel;
        if (ctx.gradeLabel.trim().toLocaleLowerCase() === "language") {
          const { data: preference, error } = await db.from("ka_student_preferences")
            .select("preferred_language_code").eq("user_id", user.id).maybeSingle();
          if (error) return errorResponse(503, "Could not load your saved language preference.");
          preferredLanguageCode = preference?.preferred_language_code || "en";
        }
        if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
          const { data: preference, error } = await db.from("ka_student_preferences")
            .select("selected_grade_label").eq("user_id", user.id).maybeSingle();
          if (error) return errorResponse(503, "Could not load your saved grade.");
          selectedGradeLabel = preference?.selected_grade_label || null;
          availableGradeOptions = (grades || []).map((g: any) => String(g.name)).filter((name: string) => name.toLocaleLowerCase() !== "tina student");
        }
      } else {
        availableGradeOptions = (grades || []).map((g: any) => String(g.name));
      }
      const subjectNames = uniqueSubjectNames(subjects).filter((s) => !(settings.disabled_subjects || []).includes(s));
      let availableIds: string[] = [];
      if (settings.games_enabled && selectedGradeLabel) {
        const [{ data: questionRows, error: questionError }, { data: gradeGames, error: gradeGameError },
          { data: gradeSubjects, error: gradeSubjectError }, { data: gameSubjectRules, error: gameSubjectError }] = await Promise.all([
          db.from("ka_questions").select("game_type,subject").eq("status", "published")
            .in("grade_label", [selectedGradeLabel, "General"])
            .or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).limit(5000),
          db.from("ka_game_grade_rules").select("game_type").eq("grade_label", selectedGradeLabel).eq("enabled", true),
          db.from("ka_grade_subject_rules").select("subject").eq("grade_label", selectedGradeLabel).eq("enabled", true),
          db.from("ka_game_subject_rules").select("game_type,subject").eq("enabled", true),
        ]);
        if (questionError || gradeGameError || gradeSubjectError || gameSubjectError) return errorResponse(503, "Could not check grade and game suitability.");
        const enabledGameIds = new Set((gradeGames || []).map((x: any) => x.game_type));
        const enabledSubjects = new Set((gradeSubjects || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
        const gameSubjectMap = new Map<string, Set<string>>();
        for (const rule of gameSubjectRules || []) {
          if (!gameSubjectMap.has(rule.game_type)) gameSubjectMap.set(rule.game_type, new Set());
          gameSubjectMap.get(rule.game_type)!.add(String(rule.subject).toLocaleLowerCase());
        }
        const rows = (questionRows || []).filter((q: any) =>
          !(settings.disabled_game_types || []).includes(q.game_type) &&
          !(settings.disabled_subjects || []).includes(q.subject) &&
          enabledSubjects.has(String(q.subject).toLocaleLowerCase()));
        const questionCounts = new Map<string, number>();
        for (const q of rows) {
          if (!enabledGameIds.has(q.game_type) || !enabledSubjects.has(String(q.subject).toLocaleLowerCase()) ||
              !gameSubjectMap.get(q.game_type)?.has(String(q.subject).toLocaleLowerCase())) continue;
          questionCounts.set(q.game_type, (questionCounts.get(q.game_type) || 0) + 1);
        }
        // Show a game only when at least five suitable, published questions are available.
        availableIds = GAME_CATALOG.filter((game) => (questionCounts.get(game.id) || 0) >= 5).map((game) => game.id);
      }
      return json(200, {
        games_enabled: settings.games_enabled,
        games: GAME_CATALOG.filter((g) => availableIds.includes(g.id)),
        subjects: subjectNames,
        progress: stats || { game_xp: 0, games_played: 0, questions_answered: 0, correct_answers: 0, current_streak: 0, best_streak: 0 },
        grade_label: selectedGradeLabel || assignedGradeLabel || "",
        assigned_grade_label: assignedGradeLabel || "",
        selected_grade_label: selectedGradeLabel,
        available_grade_options: availableGradeOptions,
        preferred_language_code: preferredLanguageCode,
        role: profile.role,
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
      const gameType = body.game_type;
      if (!validGameType(gameType)) return errorResponse(400, "Invalid game type.");
      const resolved = await playerGrade(db, profile, user.id, body.grade_label);
      if (!resolved) return errorResponse(400, "Select a valid grade before starting a game.");
      const effectiveGradeLabel = resolved.gradeLabel;
      let languageCode = body.language_code === undefined ? "" : String(body.language_code);
      if (languageCode && !["en","hi","kn","sa","fr"].includes(languageCode)) return errorResponse(400, "Invalid question language.");
      if (body.difficulty && !["easy","medium","hard"].includes(String(body.difficulty))) return errorResponse(400, "Invalid difficulty.");
      const { data: settings } = await db.from("ka_settings").select("games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!settings?.games_enabled || (settings.disabled_game_types || []).includes(gameType)) return errorResponse(423, "This game is currently unavailable.");
      const { data: subjectRows, error: subjectError } = await db.from("subjects").select("name").order("name");
      if (subjectError) return errorResponse(503, "Could not load the subject catalogue.");
      const [{ data: gradeGame, error: gradeGameError }, { data: gradeSubjectRows, error: gradeSubjectError },
        { data: gameSubjectRows, error: gameSubjectError }] = await Promise.all([
        db.from("ka_game_grade_rules").select("enabled").eq("game_type", gameType).eq("grade_label", effectiveGradeLabel).maybeSingle(),
        db.from("ka_grade_subject_rules").select("subject").eq("grade_label", effectiveGradeLabel).eq("enabled", true),
        db.from("ka_game_subject_rules").select("subject").eq("game_type", gameType).eq("enabled", true),
      ]);
      if (gradeGameError || gradeSubjectError || gameSubjectError) return errorResponse(503, "Could not verify academic suitability.");
      if (!gradeGame?.enabled) return errorResponse(423, "This game is not configured for your selected grade.");
      const allSubjects = uniqueSubjectNames(subjectRows).filter((s) => !(settings.disabled_subjects || []).includes(s));
      const eligibleSubjects = new Set((gradeSubjectRows || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      const configuredGameSubjects = new Set((gameSubjectRows || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      let allowedSubjects = gameSubjects(gameType, allSubjects).filter((s) =>
        eligibleSubjects.has(s.toLocaleLowerCase()) && configuredGameSubjects.has(s.toLocaleLowerCase()));
      if (profile.role === "Student" && ["word_master","word_builder"].includes(gameType)) {
        const ctx = await studentContext(db, profile);
        if (ctx?.gradeLabel.trim().toLocaleLowerCase() === "language") {
          const { data: preference, error } = await db.from("ka_student_preferences")
            .select("preferred_language_code").eq("user_id", user.id).maybeSingle();
          if (error) return errorResponse(503, "Could not verify your saved language preference.");
          languageCode = preference?.preferred_language_code || "en";
          const languageNames: Record<string, string> = { en: "English", hi: "Hindi", kn: "Kannada", sa: "Sanskrit", fr: "French" };
          allowedSubjects = allowedSubjects.filter((s) => s.toLocaleLowerCase() === languageNames[languageCode].toLocaleLowerCase());
        }
      }
      if (!allowedSubjects.length) return json(200, { questions: [], grade_label: effectiveGradeLabel });
      let query = db.from("ka_questions")
        .select("id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options")
        .eq("status", "published").in("grade_label", [effectiveGradeLabel, "General"]).eq("game_type", gameType)
        .in("subject", allowedSubjects)
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .order("created_at", { ascending: false }).limit(Math.min(Math.max(safeNumber(body.limit, 10), 1), 20));
      if (body.difficulty) query = query.eq("difficulty", String(body.difficulty));
      if (languageCode) query = query.eq("language_code", languageCode);
      const { data, error } = await query;
      if (error) return errorResponse(503, "Could not load questions.");
      return json(200, { questions: data || [], grade_label: effectiveGradeLabel });
    }

    if (action === "get_daily_challenge") {
      const ctx = await studentContext(db, profile);
      if (!ctx) return errorResponse(403, "A linked LIB student record and grade are required.");
      let dailyGrade = ctx.gradeLabel;
      if (ctx.gradeLabel.trim().toLocaleLowerCase() === "tina student") {
        const { data: preference, error: preferenceError } = await db.from("ka_student_preferences")
          .select("selected_grade_label").eq("user_id", user.id).maybeSingle();
        if (preferenceError) return errorResponse(503, "Could not verify your saved grade.");
        if (!preference?.selected_grade_label) return errorResponse(400, "Please select your school grade first.");
        dailyGrade = preference.selected_grade_label;
      }
      const today = indiaDate();
      const { data: dailySettings } = await db.from("ka_settings")
        .select("daily_challenge_enabled,games_enabled,disabled_game_types,disabled_subjects").eq("id", 1).maybeSingle();
      if (!dailySettings?.daily_challenge_enabled || !dailySettings.games_enabled) return json(200, { challenge: null, paused: true });
      const [{ data: gradeSubjects, error: gradeSubjectError }, { data: gradeGames, error: gradeGameError },
        { data: gameSubjectsRows, error: gameSubjectError }] = await Promise.all([
        db.from("ka_grade_subject_rules").select("subject").eq("grade_label", dailyGrade).eq("enabled", true),
        db.from("ka_game_grade_rules").select("game_type").eq("grade_label", dailyGrade).eq("enabled", true),
        db.from("ka_game_subject_rules").select("subject").eq("game_type", "quick_quiz").eq("enabled", true),
      ]);
      if (gradeSubjectError || gradeGameError || gameSubjectError) return errorResponse(503, "Could not verify daily challenge suitability.");
      const eligibleSubjects = new Set((gradeSubjects || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      const eligibleGames = new Set((gradeGames || []).map((x: any) => x.game_type));
      const quickQuizSubjects = new Set((gameSubjectsRows || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      const { data: challenge, error } = await db.from("ka_daily_challenges")
        .select("id,challenge_date,grade_label,title,description,status")
        .eq("challenge_date", today).eq("grade_label", dailyGrade).eq("status", "published").maybeSingle();
      if (error) return errorResponse(503, "Could not load today's challenge.");
      if (!challenge) return json(200, { challenge: null });
      const { data: items, error: itemError } = await db.from("ka_daily_challenge_items")
        .select("sort_order,question:ka_questions(id,subject,topic,grade_label,language_code,difficulty,game_type,status,expires_at,prompt,options)")
        .eq("challenge_id", challenge.id).order("sort_order");
      if (itemError) return errorResponse(503, "Could not load today's challenge questions.");
      const questions = (items || []).map((x: { question: any }) => x.question)
        .filter((q: any) => q && q.status === "published" &&
          (!q.expires_at || Date.parse(q.expires_at) > Date.now()) &&
          [dailyGrade, "General"].includes(q.grade_label) &&
          eligibleGames.has(q.game_type) && q.game_type === "quick_quiz" &&
          eligibleSubjects.has(String(q.subject).toLocaleLowerCase()) &&
          quickQuizSubjects.has(String(q.subject).toLocaleLowerCase()) &&
          !(dailySettings.disabled_game_types || []).includes(q.game_type) &&
          !(dailySettings.disabled_subjects || []).includes(q.subject));
      if (questions.length !== 10) return json(200, { challenge: null, questions: [], unavailable: true });
      return json(200, { challenge, questions });
    }

    if (action === "submit_attempt") {
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
      const resolved = await playerGrade(db, profile, user.id, body.grade_label);
      if (!resolved) return errorResponse(400, "Select a valid grade before submitting this game.");
      const effectiveGradeLabel = resolved.gradeLabel;
      const { data: questions, error: questionError } = await db.from("ka_questions")
        .select("id,subject,topic,grade_label,difficulty,game_type,prompt,options,explanation")
        .in("id", ids).eq("status", "published").in("grade_label", [effectiveGradeLabel, "General"])
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
      if (questionError || !questions || questions.length !== ids.length) return errorResponse(400, "One or more questions are unavailable.");
      const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : null;
      if (questions.some((q: any) => q.game_type !== gameType)) return errorResponse(400, "Questions do not match the selected game.");
      const subjectSet = new Set(questions.map((q: any) => q.subject));
      const { data: subjectRows, error: subjectError } = await db.from("subjects").select("name");
      if (subjectError) return errorResponse(503, "Could not verify question subjects.");
      const [{ data: gradeGame, error: gradeGameError }, { data: gradeSubjectRows, error: gradeSubjectError },
        { data: gameSubjectRows, error: gameSubjectError }] = await Promise.all([
        db.from("ka_game_grade_rules").select("enabled").eq("game_type", gameType).eq("grade_label", effectiveGradeLabel).maybeSingle(),
        db.from("ka_grade_subject_rules").select("subject").eq("grade_label", effectiveGradeLabel).eq("enabled", true),
        db.from("ka_game_subject_rules").select("subject").eq("game_type", gameType).eq("enabled", true),
      ]);
      if (gradeGameError || gradeSubjectError || gameSubjectError || !gradeGame?.enabled) return errorResponse(423, "This game is not configured for your selected grade.");
      const eligibleSubjects = new Set((gradeSubjectRows || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      const configuredGameSubjects = new Set((gameSubjectRows || []).map((x: any) => String(x.subject).toLocaleLowerCase()));
      const permittedSubjects = gameSubjects(gameType, uniqueSubjectNames(subjectRows)).filter((s) =>
        eligibleSubjects.has(s.toLocaleLowerCase()) && configuredGameSubjects.has(s.toLocaleLowerCase()));
      if (questions.some((q: any) => !permittedSubjects.some((s) => s.toLocaleLowerCase() === String(q.subject).toLocaleLowerCase()))) {
        return errorResponse(400, "One or more questions do not belong to this game's configured subjects.");
      }
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
        if (challengeError || !challenge || challenge.challenge_date !== today || challenge.grade_label !== effectiveGradeLabel) return errorResponse(400, "Daily challenge is not active for this grade.");
        const { data: challengeItems, error: challengeItemsError } = await db.from("ka_daily_challenge_items")
          .select("question_id,question:ka_questions(grade_label)").eq("challenge_id", challengeId);
        const eligibleItems = (challengeItems || []).filter((x: any) => x.question &&
          [effectiveGradeLabel, "General"].includes(x.question.grade_label));
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
      const { data: studentProfiles, error: profileError } = await db.from("profiles")
        .select("id").eq("role", "Student").not("linked_student_id", "is", null);
      if (profileError) return errorResponse(503, "Could not load leaderboard eligibility.");
      const studentIds = (studentProfiles || []).map((x: any) => x.id);
      const { data, error } = studentIds.length ? await db.from("ka_player_stats")
        .select("user_id,game_xp,games_played").in("user_id", studentIds)
        .order("game_xp", { ascending: false }).order("games_played", { ascending: false }).limit(100)
        : { data: [], error: null };
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
        grades: [...new Set(["General", ...(grades || []).map((x: any) => String(x.name)).filter((name: string) => name.toLocaleLowerCase() !== "tina student")])],
        subjects: uniqueSubjectNames(subjects).filter((s) => !["all","math + science"].includes(s.toLocaleLowerCase())),
        game_types: GAME_CATALOG.map((game) => game.id),
      });
    }

    if (action === "get_admin_suitability") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const [{ data: gradeSubjects, error: gsError }, { data: gameGrades, error: ggError },
        { data: gameSubjectsRows, error: gsrError }, { data: grades, error: gradesError },
        { data: subjects, error: subjectsError }] = await Promise.all([
        db.from("ka_grade_subject_rules").select("grade_label,subject,enabled,source").order("grade_label").order("subject"),
        db.from("ka_game_grade_rules").select("game_type,grade_label,enabled").order("grade_label"),
        db.from("ka_game_subject_rules").select("game_type,subject,enabled").order("game_type"),
        db.from("grades").select("name").eq("archived", false).order("sort_order"),
        db.from("subjects").select("name").order("name"),
      ]);
      if (gsError || ggError || gsrError || gradesError || subjectsError) return errorResponse(503, "Could not load suitability settings. Apply the Knowledge Arena suitability migration first.");
      return json(200, { grade_subject_rules: gradeSubjects || [], game_grade_rules: gameGrades || [],
        game_subject_rules: gameSubjectsRows || [], grades: [...new Set((grades || []).map((x: any) => x.name).filter((name: string) => String(name).toLocaleLowerCase() !== "tina student"))],
        subjects: uniqueSubjectNames(subjects).filter((s) => !["all","math + science"].includes(s.toLocaleLowerCase())), games: GAME_CATALOG });
    }

    if (action === "set_suitability") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const kind = String(body.kind || ""), enabled = body.enabled;
      if (typeof enabled !== "boolean") return errorResponse(400, "enabled must be true or false.");
      let table = "", key: Record<string,string> = {};
      if (kind === "grade_subject") { table = "ka_grade_subject_rules"; key = { grade_label: String(body.grade_label || ""), subject: String(body.subject || "") }; }
      else if (kind === "game_grade") { table = "ka_game_grade_rules"; key = { game_type: String(body.game_type || ""), grade_label: String(body.grade_label || "") }; }
      else if (kind === "game_subject") { table = "ka_game_subject_rules"; key = { game_type: String(body.game_type || ""), subject: String(body.subject || "") }; }
      else return errorResponse(400, "Unknown suitability rule.");
      if (Object.values(key).some((v) => !v) || (key.game_type && !validGameType(key.game_type))) return errorResponse(400, "Invalid suitability rule details.");
      if (key.grade_label) {
        const { data: grade } = await db.from("grades").select("name").eq("name", key.grade_label).eq("archived", false).maybeSingle();
        if (!grade || String(key.grade_label).toLocaleLowerCase() === "tina student") return errorResponse(400, "Choose a valid academic grade.");
      }
      if (key.subject) {
        const { data: subject } = await db.from("subjects").select("name").eq("name", key.subject).maybeSingle();
        if (!subject || ["all","math + science"].includes(String(key.subject).toLocaleLowerCase())) return errorResponse(400, "Choose an individual LIB subject.");
      }
      const { error } = await db.from(table).upsert({ ...key, enabled, source: kind === "grade_subject" ? "admin" : undefined,
        updated_at: new Date().toISOString(), updated_by: user.id });
      if (error) return errorResponse(503, "Could not save the suitability rule.");
      return json(200, { saved: true, kind, enabled });
    }

    if (action === "get_admin_questions") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      let query = db.from("ka_questions")
        .select("id,subject,topic,grade_label,language_code,difficulty,game_type,prompt,options,explanation,status,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (body.grade_label) query = query.eq("grade_label", String(body.grade_label));
      if (body.subject) query = query.eq("subject", String(body.subject));
      if (body.game_type) query = query.eq("game_type", String(body.game_type));
      if (body.status) query = query.eq("status", String(body.status));
      const { data, error } = await query;
      if (error) return errorResponse(503, "Could not load the Knowledge Arena question bank.");
      const questionIds = (data || []).map((q: any) => q.id);
      const { data: keys, error: keyError } = questionIds.length
        ? await db.from("ka_question_keys").select("question_id,correct_option").in("question_id", questionIds)
        : { data: [], error: null };
      if (keyError) return errorResponse(503, "Could not load question answer keys for Admin review.");
      const keyMap = new Map((keys || []).map((x: any) => [x.question_id, x.correct_option]));
      return json(200, { questions: (data || []).map((q: any) => ({
        ...q, correct_option: keyMap.get(q.id) ?? null,
      })) });
    }

    if (action === "admin_question") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const questionId = String(body.question_id || "");
      if (!questionId) return errorResponse(400, "Question ID is required.");
      const { data: existing, error: readError } = await db.from("ka_questions")
        .select("id,status").eq("id", questionId).maybeSingle();
      if (readError || !existing) return errorResponse(404, "Question not found.");
      const operation = String(body.operation || "");
      if (operation === "archive") {
        const { data, error } = await db.from("ka_questions").update({ status: "rejected" })
          .eq("id", questionId).select("id,status").single();
        if (error) return errorResponse(503, "Could not remove this question from play.");
        return json(200, { question: data });
      }
      if (operation === "publish") {
        const { data, error } = await db.from("ka_questions").update({
          status: "published", published_at: new Date().toISOString(),
        }).eq("id", questionId).select("id,status,published_at").single();
        if (error) return errorResponse(503, "Could not publish this question.");
        return json(200, { question: data });
      }
      if (operation === "delete") {
        const { error: dailyError } = await db.from("ka_daily_challenge_items").delete().eq("question_id", questionId);
        if (dailyError) return errorResponse(503, "Could not remove question references from daily challenges.");
        const { error: keyError } = await db.from("ka_question_keys").delete().eq("question_id", questionId);
        if (keyError) return errorResponse(503, "Could not remove the question answer key.");
        const { error } = await db.from("ka_questions").delete().eq("id", questionId);
        if (error) return errorResponse(503, "Could not delete this question.");
        return json(200, { deleted: true, question_id: questionId });
      }
      if (operation === "update") {
        const prompt = String(body.prompt || "").trim();
        const explanation = String(body.explanation || "").trim();
        const options = body.options;
        const correct = safeNumber(body.correct_option, -1);
        if (prompt.length < 12 || prompt.length > 700 || explanation.length < 8 || explanation.length > 900 ||
            !Array.isArray(options) || options.length !== 4 ||
            options.some((x: any) => typeof x !== "string" || !x.trim() || x.length > 250) ||
            new Set(options.map((x: string) => x.trim().toLocaleLowerCase())).size !== 4 ||
            !Number.isInteger(correct) || correct < 0 || correct > 3) {
          return errorResponse(400, "Enter a valid question, four distinct options, an explanation and a correct option.");
        }
        const { error: updateError } = await db.from("ka_questions").update({
          prompt, options, explanation, topic: String(body.topic || "General").trim().slice(0, 120),
          difficulty: ["easy","medium","hard"].includes(String(body.difficulty)) ? String(body.difficulty) : "medium",
        }).eq("id", questionId);
        if (updateError) return errorResponse(503, "Could not update the question.");
        const { error: keyError } = await db.from("ka_question_keys").update({ correct_option: correct, updated_at: new Date().toISOString() })
          .eq("question_id", questionId);
        if (keyError) return errorResponse(503, "Question updated, but its answer key could not be saved. Please retry the answer-key update.");
        return json(200, { updated: true, question_id: questionId });
      }
      return errorResponse(400, "Unknown question operation.");
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


    if (action === "get_admin_guest_leads") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const status = String(body.status || "").trim();
      const search = String(body.search || "").trim().slice(0, 100);
      const limit = Math.max(1, Math.min(100, Math.floor(safeNumber(body.limit, 50))));
      let query = db.from("ka_guest_leads").select("id,mobile_e164,last_guest_name,last_grade_label,enquiry_consent,marketing_consent,lead_status,converted_student_id,first_seen_at,last_seen_at,last_activity_at,last_game_type,last_subject", { count: "exact" })
        .order("last_seen_at", { ascending: false }).limit(limit);
      if (status && GUEST_STATUSES.includes(status)) query = query.eq("lead_status", status);
      if (search) query = query.or("mobile_e164.ilike.%" + search.replace(/[(),]/g, "") + "%,last_guest_name.ilike.%" + search.replace(/[(),]/g, "") + "%");
      const { data: leads, error, count } = await query;
      if (error) return errorResponse(503, "Could not load guest leads.");
      const ids = (leads || []).map((x: any) => x.id);
      const [{ data: sessions, error: sessionError }, { data: activity, error: activityError }] = await Promise.all([
        ids.length ? db.from("ka_guest_sessions").select("id,lead_id,guest_name,grade_label,started_at,last_seen_at,expires_at,ended_at").in("lead_id", ids).order("started_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
        ids.length ? db.from("ka_guest_activity").select("lead_id,game_type,subject,question_count,correct_count,accuracy,completed_at").in("lead_id", ids).order("completed_at", { ascending: false }) : Promise.resolve({ data: [], error: null })
      ]);
      if (sessionError || activityError) return errorResponse(503, "Could not load guest activity.");
      const sessionCounts = new Map<string, number>();
      const gameCounts = new Map<string, number>();
      const activityByLead = new Map<string, any[]>();
      for (const row of sessions || []) sessionCounts.set(row.lead_id, (sessionCounts.get(row.lead_id) || 0) + 1);
      for (const row of activity || []) {
        gameCounts.set(row.lead_id, (gameCounts.get(row.lead_id) || 0) + 1);
        const arr = activityByLead.get(row.lead_id) || [];
        if (arr.length < 8) arr.push(row);
        activityByLead.set(row.lead_id, arr);
      }
      return json(200, { total: count || 0, leads: (leads || []).map((x: any) => ({
        ...x, sessions_count: sessionCounts.get(x.id) || 0, games_completed: gameCounts.get(x.id) || 0,
        recent_activity: activityByLead.get(x.id) || []
      })) });
    }

    if (action === "get_admin_guest_lead_detail") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const leadId = String(body.lead_id || "");
      if (!leadId) return errorResponse(400, "Lead ID is required.");
      const [{ data: lead, error: leadError }, { data: sessions, error: sessionsError },
        { data: activity, error: activityError }, { data: consents, error: consentsError },
        { data: notes, error: notesError }, { data: events, error: eventsError }] = await Promise.all([
        db.from("ka_guest_leads").select("*").eq("id", leadId).maybeSingle(),
        db.from("ka_guest_sessions").select("id,guest_name,grade_label,started_at,last_seen_at,expires_at,ended_at").eq("lead_id", leadId).order("started_at", { ascending: false }).limit(100),
        db.from("ka_guest_activity").select("*").eq("lead_id", leadId).order("completed_at", { ascending: false }).limit(200),
        db.from("ka_guest_consents").select("*").eq("lead_id", leadId).order("recorded_at", { ascending: false }).limit(100),
        db.from("ka_guest_lead_notes").select("id,note,admin_user_id,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(100),
        db.from("ka_guest_promotion_events").select("promotion_id,event_type,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200)
      ]);
      if (leadError || sessionsError || activityError || consentsError || notesError || eventsError) return errorResponse(503, "Could not load guest lead details.");
      if (!lead) return errorResponse(404, "Guest lead not found.");
      return json(200, { lead, sessions: sessions || [], activity: activity || [], consents: consents || [], notes: notes || [], promotion_events: events || [] });
    }

    if (action === "admin_update_guest_lead") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const leadId = String(body.lead_id || "");
      const status = String(body.lead_status || "");
      const note = String(body.note || "").trim();
      const studentId = body.converted_student_id ? String(body.converted_student_id) : null;
      if (!leadId || !GUEST_STATUSES.includes(status)) return errorResponse(400, "Choose a valid lead status.");
      if (note.length > 2000) return errorResponse(400, "Notes must be 2,000 characters or fewer.");
      if (studentId) {
        const { data: student, error: studentError } = await db.from("students").select("id").eq("id", studentId).eq("archived", false).maybeSingle();
        if (studentError || !student) return errorResponse(400, "Select a valid active LIB student.");
      }
      const { data: updated, error } = await db.from("ka_guest_leads").update({
        lead_status: status, converted_student_id: studentId, updated_at: new Date().toISOString()
      }).eq("id", leadId).select("id,lead_status,converted_student_id").maybeSingle();
      if (error || !updated) return errorResponse(404, "Guest lead could not be updated.");
      if (note) {
        const { error: noteError } = await db.from("ka_guest_lead_notes").insert({ lead_id: leadId, admin_user_id: user.id, note });
        if (noteError) return errorResponse(503, "Lead status was updated, but the note could not be saved.");
      }
      return json(200, { lead: updated });
    }

    if (action === "get_admin_guest_promotions") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const { data, error } = await db.from("ka_guest_promotions").select("*").order("display_order").order("created_at", { ascending: false }).limit(200);
      if (error) return errorResponse(503, "Could not load guest promotions.");
      const ids = (data || []).map((x: any) => x.id);
      const { data: events, error: eventError } = ids.length
        ? await db.from("ka_guest_promotion_events").select("promotion_id,event_type").in("promotion_id", ids)
        : { data: [], error: null };
      if (eventError) return errorResponse(503, "Could not load promotion performance.");
      const counts = new Map<string, { view: number; click: number; dismiss: number }>();
      for (const e of events || []) {
        const c = counts.get(e.promotion_id) || { view: 0, click: 0, dismiss: 0 };
        c[e.event_type as "view" | "click" | "dismiss"]++;
        counts.set(e.promotion_id, c);
      }
      return json(200, { promotions: (data || []).map((p: any) => ({ ...p, metrics: counts.get(p.id) || { view: 0, click: 0, dismiss: 0 } })) });
    }

    if (action === "admin_save_guest_promotion") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const id = typeof body.id === "string" ? body.id : null;
      const title = String(body.title || "").trim();
      const description = String(body.body || "").trim();
      const ctaLabel = String(body.cta_label || "Explore courses").trim();
      const ctaUrl = String(body.cta_url || "").trim();
      const trigger = String(body.trigger || "after_game");
      const imageUrl = String(body.image_url || "").trim() || null;
      const arrays = ["target_grades","target_game_types","target_subjects"] as const;
      const targets: Record<string, string[]> = {};
      for (const key of arrays) {
        const value = body[key] === undefined ? [] : body[key];
        if (!Array.isArray(value) || value.length > 50 || value.some((x) => typeof x !== "string" || x.length > 100)) return errorResponse(400, "Promotion targeting values are invalid.");
        targets[key] = [...new Set(value as string[])];
      }
      if (!title || title.length > 120 || !description || description.length > 500 || !ctaLabel || ctaLabel.length > 50 ||
          !/^https:\\/\\//i.test(ctaUrl) || !["welcome","after_game","exit"].includes(trigger)) return errorResponse(400, "Enter a title, description, secure CTA URL and valid trigger.");
      if (imageUrl && !/^https:\\/\\//i.test(imageUrl)) return errorResponse(400, "Promotion image must use HTTPS.");
      if (targets.target_game_types.some((x) => !validGameType(x))) return errorResponse(400, "One or more target games are invalid.");
      const payload = { title, body: description, image_url: imageUrl, cta_label: ctaLabel, cta_url: ctaUrl, trigger,
        target_grades: targets.target_grades, target_game_types: targets.target_game_types, target_subjects: targets.target_subjects,
        display_order: Math.max(0, Math.min(10000, Math.floor(safeNumber(body.display_order, 100)))),
        active: body.active === true, starts_at: body.starts_at || null, ends_at: body.ends_at || null,
        created_by: user.id, updated_at: new Date().toISOString() };
      const { data, error } = id
        ? await db.from("ka_guest_promotions").update(payload).eq("id", id).select("*").maybeSingle()
        : await db.from("ka_guest_promotions").insert(payload).select("*").single();
      if (error || !data) return errorResponse(503, "Could not save the guest promotion.");
      return json(200, { promotion: data });
    }

    if (action === "admin_delete_guest_promotion") {
      if (profile.role !== "Admin") return errorResponse(403, "Admin access required.");
      const id = String(body.id || "");
      if (!id) return errorResponse(400, "Promotion ID is required.");
      const { error } = await db.from("ka_guest_promotions").delete().eq("id", id);
      if (error) return errorResponse(503, "Could not delete the promotion.");
      return json(200, { deleted: true });
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
        const { data: gameSubject } = await db.from("ka_game_subject_rules").select("enabled")
          .eq("game_type", gameType).eq("subject", subject).maybeSingle();
        if (!gameSubject?.enabled) return errorResponse(423, "This game is not configured for the selected subject.");
        if (gradeLabel !== "General") {
          const [{ data: gradeGame }, { data: gradeSubject }] = await Promise.all([
            db.from("ka_game_grade_rules").select("enabled").eq("game_type", gameType).eq("grade_label", gradeLabel).maybeSingle(),
            db.from("ka_grade_subject_rules").select("enabled").eq("grade_label", gradeLabel).eq("subject", subject).maybeSingle(),
          ]);
          if (!gradeGame?.enabled || !gradeSubject?.enabled) {
            return errorResponse(423, "This subject and game combination is not enabled for the selected grade.");
          }
        }
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
