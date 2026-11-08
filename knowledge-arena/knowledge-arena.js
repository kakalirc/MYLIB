(() => {
  "use strict";

  const SUPABASE_URL = "https://kqkojscbaycolaioyarh.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_q0TO3XyUaWHqrKSwpcm4Pw_q_sj-Hmq";
  const API_URL = SUPABASE_URL + "/functions/v1/knowledge-arena";
  const XP_PER_LEVEL = 100;
  const $ = (id) => document.getElementById(id);
  const GAME_NAMES = {
    word_master: "Word Master", number_quest: "Number Quest",
    science_explorer: "Science Explorer", quick_quiz: "Quick Quiz",
    brain_teaser: "Brain Teaser", memory_challenge: "Memory Challenge"
  };
  const SAMPLE_QUESTIONS = [
    {subject:"General Knowledge",prompt:"Which planet is known as the Red Planet?",options:["Venus","Mars","Jupiter","Mercury"],correct_option:1,explanation:"Mars looks reddish because of iron oxide on its surface."},
    {subject:"Science",prompt:"Which part of a plant mainly absorbs water from the soil?",options:["Flower","Leaf","Root","Stem"],correct_option:2,explanation:"Roots absorb water and minerals from the soil."},
    {subject:"Mathematics",prompt:"What is 12 × 8?",options:["84","88","96","108"],correct_option:2,explanation:"12 multiplied by 8 equals 96."},
    {subject:"Language",prompt:"Which word is the opposite of “ancient”?",options:["Old","Modern","Historic","Early"],correct_option:1,explanation:"Modern means relating to the present or recent times."},
    {subject:"Geography",prompt:"Which is the largest ocean on Earth?",options:["Atlantic","Indian","Arctic","Pacific"],correct_option:3,explanation:"The Pacific Ocean is the largest and deepest ocean."},
    {subject:"Logic",prompt:"What comes next: 2, 4, 8, 16, …?",options:["18","24","32","30"],correct_option:2,explanation:"Each number doubles, so 16 × 2 = 32."},
    {subject:"Science",prompt:"Which gas do plants take in during photosynthesis?",options:["Oxygen","Carbon dioxide","Nitrogen","Hydrogen"],correct_option:1,explanation:"Plants use carbon dioxide, water and light to make food."},
    {subject:"General Knowledge",prompt:"How many sides does a hexagon have?",options:["Five","Six","Seven","Eight"],correct_option:1,explanation:"A hexagon is a six-sided polygon."},
    {subject:"Language",prompt:"Choose the correctly spelled word.",options:["Beautifull","Beutiful","Beautiful","Beautifal"],correct_option:2,explanation:"Beautiful is spelled B-E-A-U-T-I-F-U-L."},
    {subject:"Geography",prompt:"Which imaginary line divides Earth into Northern and Southern Hemispheres?",options:["Prime Meridian","Equator","Tropic of Cancer","Arctic Circle"],correct_option:1,explanation:"The Equator is at 0 degrees latitude."}
  ];

  let client = null, session = null, role = "", gradeLabel = "", assignedGradeLabel = "", lockedOut = false;
  const LANGUAGE_OPTIONS = { en: "English", hi: "Hindi", kn: "Kannada", sa: "Sanskrit" };
  let previewMode = false, previewReason = "";
  let catalog = null, progress = null, leaderboard = [], dailyChallenge = null;
  let currentView = "play", currentGame = "quick_quiz", currentQuestions = [];
  let currentAnswers = [], currentIndex = 0, currentScore = 0, challengeId = null, clientAttemptId = null;
  let gameStartedAt = 0, memoryTimer = null, memoryRevealed = false;
  let adminSummary = null, adminOptions = null, adminJobs = [], adminUsageReviews = [], adminLeadership = null;

  function setStatus(label, tone) {
    const el = $("connection-status");
    if (!el) return;
    el.textContent = label;
    el.dataset.tone = tone || "neutral";
  }
  function note(message, type) {
    const el = $("connection-note");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
    el.dataset.tone = type || "info";
  }
  function hideNote() { $("connection-note").classList.add("hidden"); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]
    );
  }
  function money(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function showGate(which, message) {
    $("auth-gate").classList.toggle("hidden", which !== "auth");
    $("access-gate").classList.toggle("hidden", which !== "access");
    $("arena-shell").classList.add("hidden");
    if (message) $("access-message").textContent = message;
  }
  function showShell() {
    $("auth-gate").classList.add("hidden");
    $("access-gate").classList.add("hidden");
    $("arena-shell").classList.remove("hidden");
  }

  async function api(action, payload = {}) {
    if (lockedOut) throw new Error("This tab has been signed out. Please sign in again through My LIB.");
    const { data: authData, error: authError } = await client.auth.getSession();
    if (authError || !authData.session) throw new Error("Your LIB login has expired. Please sign in again.");
    session = authData.session;
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify({ action, ...payload })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body && body.error && body.error.message ? body.error.message : "Knowledge Arena service returned " + response.status + ".";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function usePreview(reason) {
    previewMode = true;
    previewReason = reason || "The Knowledge Arena backend is not connected yet.";
    setStatus("PREVIEW", "warning");
    note("Preview mode: " + previewReason + " Sample questions are for demonstration only. No scores or progress are saved.", "warning");
    catalog = {
      games_enabled: true,
      games: Object.keys(GAME_NAMES).map((id) => ({ id, name: GAME_NAMES[id] })),
      subjects: ["General Knowledge","Science","Mathematics","Language","Geography","Logic"],
      grade_label: "Preview",
      preferred_language_code: "en",
      progress: { game_xp: 0, games_played: 0, questions_answered: 0, correct_answers: 0, current_streak: 0, best_streak: 0 }
    };
    progress = { stats: catalog.progress, achievements: [] };
    populateSubjects();
    renderProgress();
    renderAchievements();
    renderPreviewLeaderboard();
  }

  async function initialise() {
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("OFFLINE", "danger");
      showGate("auth", "The secure login library could not be loaded. Please reload My LIB.");
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let tabWasLoggedOut = false;
    try { tabWasLoggedOut = sessionStorage.getItem("lib_tab_logged_out") === "1"; } catch (e) {}
    if (tabWasLoggedOut) {
      lockedOut = true;
      setStatus("SIGNED OUT", "warning");
      showGate("auth");
      return;
    }
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      setStatus("SIGN IN REQUIRED", "warning");
      showGate("auth");
      return;
    }
    session = data.session;
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        lockedOut = true;
        showGate("auth");
        setStatus("SIGNED OUT", "warning");
      }
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== "lib_cross_tab_logout" || !event.newValue) return;
      let signal = null;
      try { signal = JSON.parse(event.newValue); } catch (e) {}
      if (!signal || !signal.userId || signal.userId === session?.user?.id) {
        lockedOut = true;
        try { sessionStorage.setItem("lib_tab_logged_out", "1"); } catch (e) {}
        showGate("auth");
        setStatus("SIGNED OUT", "warning");
      }
    });

    try {
      const context = await api("get_context");
      role = context.role || "";
      gradeLabel = context.grade_label || "";
      assignedGradeLabel = gradeLabel;
      if (role !== "Student" && role !== "Admin") {
        showGate("access", "Only linked LIB student accounts and authorised administrators can use Knowledge Arena.");
        setStatus("ACCESS DENIED", "danger");
        return;
      }
      showShell();
      if (role === "Admin") {
        $("welcome-line").textContent = "Monitor Knowledge Arena, manage shared AI budgets and publish daily challenges.";
        prepareAdminLayout();
        await loadAdmin();
        const requested = new URLSearchParams(location.search).get("view");
        showView(requested === "admin" ? "admin" : "admin");
      } else {
        $("admin-nav").classList.add("hidden");
        await loadStudent();
        const requested = new URLSearchParams(location.search).get("view");
        showView(["daily","progress","achievements","leaderboard"].includes(requested) ? requested : "play");
      }
    } catch (error) {
      if (error.status === 401) {
        showGate("auth");
        setStatus("SIGN IN REQUIRED", "warning");
      } else if (error.status === 403) {
        showGate("access", error.message);
        setStatus("ACCESS DENIED", "danger");
      } else {
        showShell();
        const requestedView = new URLSearchParams(location.search).get("view");
        if (requestedView === "admin") {
          role = "AdminPreview";
          prepareAdminLayout();
          usePreview(error.message || "The Knowledge Arena API is not deployed yet.");
          renderAdminPreview(error.message || "The Knowledge Arena API is not deployed yet.");
        } else {
          usePreview(error.message || "The Knowledge Arena API is not deployed yet.");
        }
      }
    }
  }

  async function loadStudent() {
    setStatus("CONNECTING", "neutral");
    try {
      catalog = await api("get_catalog");
      if (catalog.grade_label) gradeLabel = catalog.grade_label;
      progress = await api("get_my_progress");
      populateSubjects();
      configureLanguageChoice();
      configureTinaGradeChoice();
      const enabledGames = new Set((catalog.games || []).map((game) => game.id));
      document.querySelectorAll(".game-card").forEach((card) => {
        const launch = card.querySelector(".launch");
        if (!launch) return;
        const enabled = enabledGames.has(launch.dataset.game);
        card.classList.toggle("game-disabled", !enabled);
        launch.disabled = !enabled;
        if (!enabled) launch.textContent = "Temporarily unavailable";
      });
      renderProgress();
      renderAchievements();
      await loadLeaderboard();
      setStatus("CONNECTED", "success");
      hideNote();
      $("grade-label").textContent = gradeLabel ? "Your class: " + gradeLabel : "Unlimited practice";
      $("welcome-line").textContent = "Your class: " + (gradeLabel || "General") + ". Learn, play and build your own Game XP.";
      if (!catalog.games_enabled) note("Games are temporarily paused by Admin. You can return when they are enabled.", "warning");
    } catch (error) {
      if (error.status === 403) throw error;
      usePreview(error.message || "The Knowledge Arena database or API is still being prepared.");
    }
  }

  function configureTinaGradeChoice() {
    const isTinaStudent = assignedGradeLabel.trim().toLocaleLowerCase() === "tina student";
    $("tina-grade-choice").classList.toggle("hidden", !isTinaStudent);
    if (!isTinaStudent) return;
    const select = $("tina-grade-select");
    const options = Array.isArray(catalog?.available_grade_options) ? catalog.available_grade_options : [];
    select.innerHTML = '<option value="">Select your grade</option>' + options.map((name) =>
      '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join("");
    select.value = catalog?.selected_grade_label || "";
    $("academic-subject-choice").classList.toggle("hidden", !select.value);
    $("language-subject-choice").classList.add("hidden");
    if (!select.value) note("Please select your school grade before starting a game.", "info");
  }

  async function saveTinaGradePreference() {
    if (assignedGradeLabel.trim().toLocaleLowerCase() !== "tina student" || previewMode) return;
    const select = $("tina-grade-select");
    const previous = catalog?.selected_grade_label || "";
    select.disabled = true;
    try {
      const result = await api("set_grade_preference", { grade_label: select.value });
      catalog.selected_grade_label = result.grade_label;
      catalog.grade_label = result.grade_label;
      gradeLabel = result.grade_label;
      $("academic-subject-choice").classList.remove("hidden");
      $("grade-label").textContent = "Your selected grade: " + gradeLabel;
      $("welcome-line").textContent = "Your selected grade: " + gradeLabel + ". Learn, play and build your own Game XP.";
      note("Your grade is saved as " + gradeLabel + ". You can change it any time.", "success");
    } catch (error) {
      select.value = previous;
      note("Could not save your grade: " + error.message, "warning");
    } finally { select.disabled = false; }
  }

  function configureLanguageChoice() {
    const isLanguageStudent = gradeLabel.trim().toLocaleLowerCase() === "language";
    $("academic-subject-choice").classList.toggle("hidden", isLanguageStudent);
    $("language-subject-choice").classList.toggle("hidden", !isLanguageStudent);
    if (isLanguageStudent) {
      $("language-select").value = LANGUAGE_OPTIONS[catalog?.preferred_language_code] ? catalog.preferred_language_code : "en";
    }
  }

  async function savePreferredLanguage() {
    if (gradeLabel.trim().toLocaleLowerCase() !== "language" || previewMode) return;
    const select = $("language-select");
    const previous = catalog?.preferred_language_code || "en";
    select.disabled = true;
    try {
      const result = await api("set_language_preference", { language_code: select.value });
      catalog.preferred_language_code = result.language_code;
      note("Your preferred language is saved as " + LANGUAGE_OPTIONS[result.language_code] + ".", "success");
    } catch (error) {
      select.value = previous;
      note("Could not save your language preference: " + error.message, "warning");
    } finally { select.disabled = false; }
  }

  function populateSubjects() {
    const select = $("subject-select");
    if (!select) return;
    const subjects = catalog && Array.isArray(catalog.subjects) ? catalog.subjects : [];
    // Protect the dropdown from duplicate subject rows and case/spacing variants.
    const uniqueSubjects = [...new Map(subjects
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .map((name) => [name.toLocaleLowerCase(), name])).values()];
    select.innerHTML = uniqueSubjects.length
      ? uniqueSubjects.map((name) => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join("")
      : '<option value="">No subjects available</option>';
  }

  function levelInfo(xp) {
    const level = Math.floor(Math.max(0, Number(xp || 0)) / XP_PER_LEVEL) + 1;
    const into = Math.max(0, Number(xp || 0)) % XP_PER_LEVEL;
    return { level, into, remaining: XP_PER_LEVEL - into };
  }
  function renderProgress() {
    const xp = progress && progress.stats ? Number(progress.stats.game_xp || 0) : 0;
    const info = levelInfo(xp);
    $("hero-xp").textContent = xp.toLocaleString("en-IN");
    $("hero-level").textContent = "LEVEL " + info.level + " · " + (info.level >= 10 ? "MASTER" : info.level >= 5 ? "CHAMPION" : info.level >= 2 ? "EXPLORER" : "BEGINNER");
    $("hero-progress").style.width = info.into + "%";
    $("hero-next-level").textContent = info.remaining + " XP to the next level";
    const stats = progress && progress.stats ? progress.stats : {};
    const answered = Math.max(0, Number(stats.questions_answered || 0));
    const correct = Math.max(0, Number(stats.correct_answers || 0));
    $("progress-total-xp").textContent = xp.toLocaleString("en-IN");
    $("progress-level-name").textContent = $("hero-level").textContent;
    $("progress-level-bar").style.width = info.into + "%";
    $("progress-next-level").textContent = info.remaining + " XP to the next level";
    $("progress-games-played").textContent = Number(stats.games_played || 0).toLocaleString("en-IN");
    $("progress-questions").textContent = answered.toLocaleString("en-IN");
    $("progress-correct").textContent = correct.toLocaleString("en-IN");
    $("progress-accuracy").textContent = (answered ? Math.round(correct / answered * 100) : 0) + "%";
    $("progress-current-streak").textContent = Number(stats.current_streak || 0).toLocaleString("en-IN");
    $("progress-best-streak").textContent = Number(stats.best_streak || 0).toLocaleString("en-IN");
  }

  function renderAchievements() {
    const achievements = progress && progress.achievements ? progress.achievements : [];
    $("achievement-grid").innerHTML = achievements.length ? achievements.map((a) =>
      '<article class="achievement ' + (a.unlocked ? "" : "locked") + '"><span>' + escapeHtml(a.icon || "🏅") + '</span><div><b>' +
      escapeHtml(a.title) + '</b><small>' + escapeHtml(a.description) + '</small></div><i>' +
      (a.unlocked ? "Unlocked" : "Locked") + '</i></article>'
    ).join("") : '<p class="muted">Achievements will appear here when Knowledge Arena progress is connected.</p>';
  }

  function renderPreviewLeaderboard() {
    const previewRows = [
      ["1","Preview Player A","860"],["2","Preview Player B","740"],["3","You","0"],["4","Preview Player C","510"]
    ].map((r) => '<div class="leader-row"><b class="rank">' + r[0] + '</b><span>' + r[1] + '</span><b>' + r[2] + '</b></div>').join("");
    $("leaderboard-rows").innerHTML = previewRows;
    $("achievement-leaderboard-rows").innerHTML = previewRows;
  }
  async function loadLeaderboard() {
    const data = await api("get_leaderboard");
    leaderboard = data.leaderboard || [];
    const rows = leaderboard.length ? leaderboard.map((r) =>
      '<div class="leader-row ' + (r.is_me ? "you" : "") + '"><b class="rank">' + r.rank +
      '</b><span>' + escapeHtml(r.display_name) + (r.is_me ? "<small>You</small>" : "") +
      '</span><b>' + Number(r.game_xp || 0).toLocaleString("en-IN") + '</b></div>'
    ).join("") : '<p class="muted">No scores yet. Be the first to play!</p>';
    $("leaderboard-rows").innerHTML = rows;
    $("achievement-leaderboard-rows").innerHTML = rows;
  }

  function prepareAdminLayout() {
    const hero = document.querySelector("#arena-shell .hero");
    if (hero) hero.classList.add("hidden");
    document.querySelectorAll("#main-nav .nav-btn:not(#admin-nav)").forEach((button) => button.classList.add("hidden"));
    $("admin-nav").classList.remove("hidden");
  }

  function showView(name) {
    if (name === "admin" && role !== "Admin" && role !== "AdminPreview") return;
    currentView = name;
    ["play","daily","progress","achievements","leaderboard","admin"].forEach((v) => {
      const section = $("view-" + v);
      if (section) section.classList.toggle("hidden", v !== name);
    });
    $("quiz").classList.add("hidden");
    $("results").classList.add("hidden");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "daily" && role === "Student") loadDailyChallenge();
    if ((name === "leaderboard" || name === "achievements") && role === "Student" && !previewMode) loadLeaderboard().catch((e) => note(e.message, "warning"));
  }

  async function startGame(game, isDaily) {
    currentGame = game;
    challengeId = null;
    currentAnswers = [];
    currentIndex = 0;
    currentScore = 0;
    memoryRevealed = false;
    if (memoryTimer) clearTimeout(memoryTimer);
    if (previewMode) {
      currentQuestions = [...SAMPLE_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, isDaily ? 10 : 5)
        .map((q, i) => ({ ...q, id: "preview-" + i }));
      currentGame = game || "quick_quiz";
      startQuestionView();
      return;
    }
    if (isDaily) {
      if (!dailyChallenge || !dailyChallenge.questions || dailyChallenge.questions.length !== 10) {
        note("Today's grade-specific challenge is not published yet. Please try again later.", "info");
        showView("daily");
        return;
      }
      currentQuestions = dailyChallenge.questions;
      challengeId = dailyChallenge.challenge.id;
      currentGame = "quick_quiz";
    } else {
      if (assignedGradeLabel.trim().toLocaleLowerCase() === "tina student" && !catalog?.selected_grade_label) {
        note("Please select your school grade first.", "warning"); return;
      }
      const isLanguageStudent = assignedGradeLabel.trim().toLocaleLowerCase() === "language";
      const languageCode = isLanguageStudent ? $("language-select").value : "en";
      const subject = isLanguageStudent ? LANGUAGE_OPTIONS[languageCode] : $("subject-select").value;
      if (!subject) { note(isLanguageStudent ? "Please choose a language first." : "Please choose a subject first.", "warning"); return; }
      try {
        const data = await api("get_questions", { game_type: game, subject, language_code: languageCode, limit: 10 });
        currentQuestions = (data.questions || []).sort(() => Math.random() - 0.5);
        if (!currentQuestions.length) {
          note("There are no published questions for " + GAME_NAMES[game] + " in " + subject + " yet. Please try another subject or return later.", "info");
          return;
        }
      } catch (error) {
        note(error.message, "warning");
        return;
      }
    }
    startQuestionView();
  }

  function startQuestionView() {
    if (!currentQuestions.length) return;
    gameStartedAt = Date.now();
    clientAttemptId = crypto.randomUUID();
    currentAnswers = [];
    currentIndex = 0;
    $("results").classList.add("hidden");
    ["play","daily","achievements","leaderboard","admin"].forEach((v) => $("view-" + v).classList.add("hidden"));
    $("quiz").classList.remove("hidden");
    renderQuestion();
  }

  function renderQuestion() {
    if (memoryTimer) clearTimeout(memoryTimer);
    const q = currentQuestions[currentIndex];
    $("quiz-count").textContent = "QUESTION " + (currentIndex + 1) + " OF " + currentQuestions.length;
    $("quiz-progress").style.width = (currentIndex / currentQuestions.length * 100) + "%";
    $("quiz-category").textContent = (q.subject || "KNOWLEDGE ARENA").toUpperCase();
    $("quiz-question").textContent = q.prompt;
    $("quiz-feedback").textContent = "";
    $("next-question").classList.add("hidden");
    $("answers").innerHTML = "";
    memoryRevealed = currentGame !== "memory_challenge";
    if (currentGame === "memory_challenge") {
      $("memory-instruction").classList.remove("hidden");
      $("answers").innerHTML = '<p class="muted">Memorise the prompt for 6 seconds…</p>';
      memoryTimer = setTimeout(() => {
        memoryRevealed = true;
        $("quiz-question").textContent = "What do you remember?";
        $("memory-instruction").classList.add("hidden");
        renderAnswers(q);
      }, 6000);
      return;
    }
    $("memory-instruction").classList.add("hidden");
    renderAnswers(q);
  }

  function renderAnswers(q) {
    $("answers").innerHTML = "";
    q.options.forEach((answer, i) => {
      const button = document.createElement("button");
      button.className = "answer";
      button.textContent = String.fromCharCode(65 + i) + ".  " + answer;
      button.addEventListener("click", () => chooseAnswer(i));
      $("answers").appendChild(button);
    });
  }

  function chooseAnswer(optionIndex) {
    if (currentAnswers[currentIndex]) return;
    const q = currentQuestions[currentIndex];
    currentAnswers[currentIndex] = { question_id: q.id, option_index: optionIndex };
    [...$("answers").children].forEach((button, i) => {
      if (button.tagName !== "BUTTON") return;
      button.disabled = true;
      if (previewMode && i === q.correct_option) button.classList.add("correct");
      if (previewMode && i === optionIndex && i !== q.correct_option) button.classList.add("wrong");
      if (i === optionIndex) button.classList.add("selected");
    });
    if (previewMode) {
      if (optionIndex === q.correct_option) currentScore++;
      $("quiz-feedback").textContent = optionIndex === q.correct_option ? "Correct! " + q.explanation : "Not quite. " + q.explanation;
    } else {
      $("quiz-feedback").textContent = "Answer recorded. Your result will be checked securely when you finish.";
    }
    $("next-question").textContent = currentIndex === currentQuestions.length - 1 ? "See results →" : "Next question →";
    $("next-question").classList.remove("hidden");
    $("quiz-progress").style.width = ((currentIndex + 1) / currentQuestions.length * 100) + "%";
  }

  async function finishGame() {
    $("next-question").disabled = true;
    if (memoryTimer) clearTimeout(memoryTimer);
    if (previewMode) {
      const earned = currentScore * 5 + (currentScore === currentQuestions.length ? 10 : 0);
      $("result-score").textContent = currentScore + " / " + currentQuestions.length;
      $("result-title").textContent = currentScore === currentQuestions.length ? "Perfect score!" : currentScore >= Math.ceil(currentQuestions.length * 0.6) ? "Well played!" : "Good effort!";
      $("result-message").textContent = "Preview only: " + earned + " sample Game XP. This score is not saved.";
      $("result-review").innerHTML = "";
      $("quiz").classList.add("hidden");
      $("results").classList.remove("hidden");
      $("next-question").disabled = false;
      return;
    }
    try {
      const payload = {
        client_attempt_id: clientAttemptId,
        game_type: currentGame,
        client_attempt_id: clientAttemptId,
        answers: currentAnswers,
        duration_seconds: Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000))
      };
      if (challengeId) payload.challenge_id = challengeId;
      const result = await api("submit_attempt", payload);
      currentScore = Number(result.correct_count || 0);
      $("result-score").textContent = currentScore + " / " + Number(result.question_count || currentQuestions.length);
      $("result-title").textContent = currentScore === currentQuestions.length ? "Perfect score!" : currentScore >= Math.ceil(currentQuestions.length * 0.6) ? "Well played!" : "Good effort!";
      $("result-message").textContent = "Accuracy: " + result.accuracy + "%. You earned " + Number(result.xp_awarded || 0) + " Game XP. Your XP is separate from attendance rewards.";
      const feedback = new Map((result.feedback || []).map((x) => [x.question_id, x]));
      $("result-review").innerHTML = currentQuestions.map((q, i) => {
        const item = feedback.get(q.id);
        if (!item) return "";
        const correctAnswer = q.options && q.options[item.correct_option] ? q.options[item.correct_option] : "";
        return '<div class="result-review-item"><b>' + (i + 1) + '. ' + (item.correct ? "Correct" : "Incorrect") +
          '</b>' + (!item.correct && correctAnswer ? '<p><strong>Correct answer:</strong> ' + escapeHtml(correctAnswer) + '</p>' : '') +
          '<p>' + escapeHtml(item.explanation || "") + '</p></div>';
      }).join("");
      $("quiz").classList.add("hidden");
      $("results").classList.remove("hidden");
      progress = await api("get_my_progress");
      renderProgress();
      renderAchievements();
      await loadLeaderboard();
      $("next-question").disabled = false;
    } catch (error) {
      $("next-question").disabled = false;
      $("quiz-feedback").textContent = "We could not save this attempt: " + error.message + " Please do not close this page; return to the game and try again.";
      $("next-question").textContent = "Retry submission";
      $("next-question").classList.remove("hidden");
    }
  }

  async function loadDailyChallenge() {
    $("daily-message").textContent = "Checking today's challenge…";
    if (previewMode) {
      dailyChallenge = { preview: true };
      $("daily-title").textContent = "Today's Knowledge Mix (preview)";
      $("daily-description").textContent = "Ten sample questions across a range of subjects. Preview results are not saved.";
      $("daily-message").textContent = "Preview mode only. Daily challenges become live after the backend is deployed and today's challenge is published.";
      return;
    }
    try {
      dailyChallenge = await api("get_daily_challenge");
      if (dailyChallenge.challenge && dailyChallenge.questions.length === 10) {
        $("daily-title").textContent = dailyChallenge.challenge.title;
        $("daily-description").textContent = dailyChallenge.challenge.description || "Ten questions selected for your class.";
        $("daily-message").textContent = "Your grade-specific challenge is ready. You can attempt it as many times as you like.";
      } else if (dailyChallenge.paused) {
        $("daily-message").textContent = "Daily challenges are temporarily paused by Admin.";
      } else {
        $("daily-message").textContent = "Today's challenge is being prepared for your grade. Please try again later.";
      }
    } catch (error) {
      $("daily-message").textContent = error.message;
    }
  }

  function disableAdminPreviewControls() {
    document.querySelectorAll("#view-admin button, #view-admin input, #view-admin select").forEach((control) => {
      control.disabled = true;
    });
  }

  function renderAdminPreview(message) {
    prepareAdminLayout();
    adminSummary = {
      registered_players: "—", active_players_today: "—", games_played_today: "—",
      question_bank_published: "—", average_accuracy_30d: "—",
      ai_cost_inr_today: 0, ai_cost_inr_month: 0, generation_failures_24h: "—",
      automation: { games_enabled: true, generation_enabled: false, daily_challenge_enabled: false,
        daily_ai_budget_inr: 100, monthly_ai_budget_inr: 1000 },
      grades: ["General","Class 1","Class 2"], subjects: ["Mathematics","Science","English"]
    };
    adminOptions = { grades: adminSummary.grades, subjects: adminSummary.subjects };
    adminJobs = [];
    adminUsageReviews = [];
    renderAdmin();
    renderLeadership();
    disableAdminPreviewControls();
    if (message) note("Admin preview only: " + message + " Controls are disabled until the authenticated API and schema are deployed.", "warning");
    showView("admin");
  }

  async function loadAdmin() {
    setStatus("ADMIN", "success");
    try {
      const [summary, options, jobs, usage] = await Promise.all([
        api("get_admin_summary"), api("get_admin_options"), api("get_admin_jobs"), api("get_admin_usage_reviews")
      ]);
      adminSummary = summary.summary;
      adminOptions = options;
      adminJobs = jobs.jobs || [];
      adminUsageReviews = usage.reviews || [];
      renderAdmin();
      await refreshLeadership();
    } catch (error) {
      usePreview("Admin API/database setup is pending: " + error.message);
      $("admin-nav").classList.remove("hidden");
      renderAdminPreview(error.message);
    }
  }

  function renderAdmin() {
    const a = adminSummary || {};
    const settings = a.automation || {};
    $("admin-metrics").innerHTML = [
      ["Registered players",a.registered_players],["Active today",a.active_players_today],
      ["Games today",a.games_played_today],["Published questions",a.question_bank_published],
      ["Average accuracy (30d)",a.average_accuracy_30d == null ? "—" : a.average_accuracy_30d + "%"],
      ["AI spend today",money(a.ai_cost_inr_today)],["AI spend this month",money(a.ai_cost_inr_month)],
      ["Unsettled AI reserve",money(a.ai_cost_inr_reserved_today)],["Generation failures (24h)",a.generation_failures_24h]
    ].map((m) => '<article class="metric"><small>' + m[0] + '</small><strong>' + (m[1] == null ? "—" : m[1]) + '</strong></article>').join("");
    $("admin-games-enabled").checked = !!settings.games_enabled;
    $("admin-generation-enabled").checked = !!settings.generation_enabled;
    $("admin-daily-enabled").checked = !!settings.daily_challenge_enabled;
    $("admin-daily-budget").value = settings.daily_ai_budget_inr == null ? 100 : settings.daily_ai_budget_inr;
    $("admin-monthly-budget").value = settings.monthly_ai_budget_inr == null ? 1000 : settings.monthly_ai_budget_inr;
    const grades = adminOptions && adminOptions.grades ? adminOptions.grades : a.grades || [];
    const subjects = adminOptions && adminOptions.subjects ? adminOptions.subjects : a.subjects || [];
    $("queue-grade").innerHTML = [...new Set(["General", ...grades])].map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
    $("queue-subject").innerHTML = subjects.map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
    const disabledGames = new Set(settings.disabled_game_types || []);
    const disabledSubjects = new Set(settings.disabled_subjects || []);
    const gameTypes = adminOptions && adminOptions.game_types ? adminOptions.game_types : Object.keys(GAME_NAMES);
    $("admin-game-switches").innerHTML = gameTypes.map((id) =>
      '<label><input type="checkbox" data-disable-game="' + escapeHtml(id) + '" ' + (disabledGames.has(id) ? 'checked' : '') + '> ' + escapeHtml(GAME_NAMES[id] || id) + '</label>'
    ).join("");
    $("admin-subject-switches").innerHTML = subjects.map((subject) =>
      '<label><input type="checkbox" data-disable-subject="' + escapeHtml(subject) + '" ' + (disabledSubjects.has(subject) ? 'checked' : '') + '> ' + escapeHtml(subject) + '</label>'
    ).join("");
    renderJobs();
    renderUsageReviews();
  }

  function renderJobs() {
    if (!adminJobs.length) { $("admin-jobs").innerHTML = '<p class="muted">No generation jobs have been queued.</p>'; return; }
    $("admin-jobs").innerHTML = '<div class="admin-job-list">' + adminJobs.map((job) =>
      '<div class="admin-job"><div><b>' + escapeHtml(job.subject || "—") + ' · ' + escapeHtml(job.grade_label || "—") +
      '</b><small>' + escapeHtml(GAME_NAMES[job.game_type] || job.game_type) + ' · ' + escapeHtml(job.difficulty) +
      ' · ' + job.published_count + '/' + job.requested_count + ' published · ' + escapeHtml(job.status) +
      '</small>' + (job.error_summary ? '<small class="job-error">' + escapeHtml(job.error_summary) + '</small>' : '') +
      '</div><div class="job-actions">' +
      (job.status === "queued" ? '<button class="text-btn" data-job-action="pause" data-job-id="' + job.id + '">Pause</button>' : "") +
      (job.status === "paused" ? '<button class="text-btn" data-job-action="resume" data-job-id="' + job.id + '">Resume</button>' : "") +
      '</div></div>'
    ).join("") + '</div>';
    $("admin-jobs").querySelectorAll("[data-job-action]").forEach((button) => {
      button.addEventListener("click", () => updateJob(button.dataset.jobAction, button.dataset.jobId));
    });
  }

  function renderUsageReviews() {
    if (!adminUsageReviews.length) {
      $("admin-usage-reviews").innerHTML = '<p class="muted">No AI usage reservations require review.</p>';
      return;
    }
    $("admin-usage-reviews").innerHTML = '<div class="admin-job-list">' + adminUsageReviews.map((row) => {
      const job = row.job || {};
      const defaultCost = row.actual_cost_inr != null && Number(row.actual_cost_inr) > 0
        ? Number(row.actual_cost_inr) : Number(row.reserved_cost_inr || 0);
      return '<div class="admin-job usage-review"><div><b>' + escapeHtml(job.subject || "Generation batch") +
        ' · ' + escapeHtml(job.grade_label || "—") + '</b><small>' +
        escapeHtml(GAME_NAMES[job.game_type] || job.game_type || "—") + ' · Reserved ' + money(row.reserved_cost_inr) +
        ' · Observed ' + money(row.actual_cost_inr) + ' · ' + Number(row.input_tokens || 0) + ' input / ' +
        Number(row.output_tokens || 0) + ' output tokens</small><small>Created ' + escapeHtml(row.created_at || "") +
        ' · Job ' + escapeHtml(job.status || "unknown") + '</small></div><div class="usage-review-action">' +
        '<label>Confirmed actual cost (₹)<input type="number" min="0" step="0.01" id="usage-cost-' + row.id +
        '" value="' + defaultCost + '"></label><button class="btn-secondary" data-usage-settle="' + row.id +
        '">Confirm &amp; settle</button></div></div>';
    }).join("") + '</div>';
    $("admin-usage-reviews").querySelectorAll("[data-usage-settle]").forEach((button) => {
      button.addEventListener("click", () => settleUsage(button.dataset.usageSettle));
    });
  }

  async function settleUsage(usageId) {
    const input = $("usage-cost-" + usageId);
    const actualCost = Number(input && input.value);
    if (!Number.isFinite(actualCost) || actualCost < 0) { alert("Enter a valid confirmed INR cost."); return; }
    try {
      await api("admin_control", { control: "resolve_usage_review", usage_id: usageId, actual_cost_inr: actualCost });
      await refreshAdmin();
    } catch (error) { alert(error.message); }
  }

  async function refreshAdmin() {
    const [summary, jobs, usage] = await Promise.all([
      api("get_admin_summary"), api("get_admin_jobs"), api("get_admin_usage_reviews")
    ]);
    adminSummary = summary.summary;
    adminJobs = jobs.jobs || [];
    adminUsageReviews = usage.reviews || [];
    renderAdmin();
    await refreshLeadership();
  }
  async function refreshLeadership() {
    const feedback = $("leadership-feedback");
    if (feedback) feedback.textContent = "Refreshing student leadership…";
    try {
      adminLeadership = await api("get_admin_leadership");
      renderLeadership();
      if (feedback) feedback.textContent = "Game progress updated. Attendance rewards remain in the existing LIB system.";
    } catch (error) {
      if ($("leadership-game-leaders")) $("leadership-game-leaders").innerHTML = '<p class="muted">' + escapeHtml(error.message) + '</p>';
      if (feedback) feedback.textContent = "Could not refresh leadership data.";
    }
  }
  function renderLeadership() {
    const data = adminLeadership || {};
    const summary = data.summary || {};
    const unavailable = !adminLeadership;
    $("leadership-metrics").innerHTML = [
      ["Game players", unavailable ? "—" : summary.game_players || 0],
      ["Total Game XP", unavailable ? "—" : Number(summary.game_xp_total || 0).toLocaleString("en-IN")],
      ["Game achievements", unavailable ? "—" : summary.game_achievements_total || 0]
    ].map((m) => '<article class="metric"><small>' + m[0] + '</small><strong>' + m[1] + '</strong></article>').join("");
    const players = data.players || [];
    if (!players.length) {
      $("leadership-game-leaders").innerHTML = '<p class="muted">' + (unavailable ? 'Live leadership data is unavailable in preview mode.' : 'No Knowledge Arena game progress has been recorded yet.') + '</p>';
    } else {
      const head = '<div class="leadership-row leadership-header"><span>RANK</span><span>STUDENT</span><span>GRADE</span><span>GAME XP / LEVEL</span><span>GAMES</span><span>ACCURACY</span><span>BADGES</span><span>STREAK</span></div>';
      const rows = players.map((p) => '<div class="leadership-row"><span>#' + p.rank + '</span><span><b>' + escapeHtml(p.student_name) + '</b>' + (p.student_code ? '<small>' + escapeHtml(p.student_code) + '</small>' : '') + '</span><span>' + escapeHtml(p.grade_label) + '</span><span><b>' + Number(p.game_xp || 0).toLocaleString("en-IN") + ' XP</b><small>Level ' + p.game_level + '</small></span><span>' + p.games_played + '</span><span>' + p.accuracy_percent + '%</span><span>' + p.achievements_earned + '</span><span>' + p.current_streak + ' days<small>Best ' + p.best_streak + '</small></span></div>').join("");
      $("leadership-game-leaders").innerHTML = '<div class="leadership-table">' + head + rows + '</div>';
    }
    const attendance = data.attendance_rewards || {};
    $("leadership-attendance").innerHTML = '<strong>Attendance rewards remain separate.</strong><p class="muted">' + escapeHtml(attendance.message || "The existing attendance reward source has not yet been connected.") + '</p>';
  }
  async function updateJob(action, jobId) {
    try {
      await api("admin_control", { control: action === "pause" ? "pause_job" : "resume_job", job_id: jobId });
      await refreshAdmin();
    } catch (error) { alert(error.message); }
  }

  async function savePlatformControls() {
    const feedback = $("platform-feedback");
    feedback.textContent = "Saving…";
    try {
      await api("admin_control", { control: "set_games_enabled", enabled: $("admin-games-enabled").checked });
      await api("admin_control", { control: "set_generation_enabled", enabled: $("admin-generation-enabled").checked });
      await api("admin_control", { control: "set_daily_challenge_enabled", enabled: $("admin-daily-enabled").checked });
      feedback.textContent = "Saved.";
      await refreshAdmin();
    } catch (error) { feedback.textContent = error.message; }
  }
  async function saveContentControls() {
    const feedback = $("content-feedback");
    feedback.textContent = "Saving…";
    try {
      const disabledGames = [...document.querySelectorAll("[data-disable-game]:checked")].map((x) => x.dataset.disableGame);
      const disabledSubjects = [...document.querySelectorAll("[data-disable-subject]:checked")].map((x) => x.dataset.disableSubject);
      await api("admin_control", { control: "set_disabled_game_types", values: disabledGames });
      await api("admin_control", { control: "set_disabled_subjects", values: disabledSubjects });
      feedback.textContent = "Game and subject availability saved.";
      await refreshAdmin();
    } catch (error) { feedback.textContent = error.message; }
  }

  async function saveBudgets() {
    const feedback = $("budget-feedback");
    const daily = Number($("admin-daily-budget").value);
    const monthly = Number($("admin-monthly-budget").value);
    if (!Number.isFinite(daily) || !Number.isFinite(monthly) || daily < 0 || monthly < 0 || daily > monthly) {
      feedback.textContent = "Enter valid amounts; daily limit cannot exceed monthly limit.";
      return;
    }
    feedback.textContent = "Saving…";
    try {
      await api("admin_control", { control: "set_ai_budgets", daily_ai_budget_inr: daily, monthly_ai_budget_inr: monthly });
      feedback.textContent = "Budgets saved.";
      await refreshAdmin();
    } catch (error) { feedback.textContent = error.message; }
  }
  async function publishDaily() {
    const feedback = $("daily-publish-feedback");
    feedback.textContent = "Publishing…";
    try {
      const result = await api("admin_control", { control: "publish_daily_challenge" });
      const p = result.publication || {};
      feedback.textContent = p.paused ? "Daily challenges are disabled." :
        "Published for: " + ((p.published_grades || []).join(", ") || "none") +
        ". Already published: " + ((p.already_published_grades || []).join(", ") || "none") +
        ". Not ready for: " + ((p.skipped_grades || []).join(", ") || "none") + ".";
      await refreshAdmin();
    } catch (error) { feedback.textContent = error.message; }
  }
  async function queueGeneration() {
    const feedback = $("queue-feedback");
    const count = Number($("queue-count").value);
    if (!Number.isInteger(count) || count < 1 || count > 20) { feedback.textContent = "Choose between 1 and 20 questions."; return; }
    feedback.textContent = "Queueing…";
    try {
      const result = await api("admin_control", {
        control: "queue_generation",
        grade_label: $("queue-grade").value,
        subject: $("queue-subject").value,
        game_type: $("queue-game").value,
        difficulty: $("queue-difficulty").value,
        language_code: $("queue-language").value,
        requested_count: count,
        topic: $("queue-topic").value.trim()
      });
      feedback.textContent = "Job queued: " + result.job.id;
      await refreshAdmin();
    } catch (error) { feedback.textContent = error.message; }
  }

  document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll(".launch").forEach((button) => button.addEventListener("click", () => startGame(button.dataset.game, false)));
  $("filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    document.querySelectorAll(".filter").forEach((x) => x.classList.toggle("active", x === button));
    document.querySelectorAll(".game-card").forEach((card) => card.classList.toggle("hidden",
      button.dataset.filter !== "all" && card.dataset.kind !== button.dataset.filter));
  });
  $("language-select").addEventListener("change", savePreferredLanguage);
  $("tina-grade-select").addEventListener("change", saveTinaGradePreference);
  $("start-featured").addEventListener("click", () => startGame("quick_quiz", false));
  $("start-daily").addEventListener("click", () => startGame("quick_quiz", true));
  $("quit-quiz").addEventListener("click", () => {
    if (memoryTimer) clearTimeout(memoryTimer);
    showView(challengeId ? "daily" : "play");
  });
  $("next-question").addEventListener("click", () => {
    if (currentAnswers[currentIndex] && currentIndex < currentQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else if (currentAnswers[currentIndex] && currentIndex === currentQuestions.length - 1) {
      finishGame();
    } else if (!previewMode && $("next-question").textContent === "Retry submission") {
      finishGame();
    }
  });
  $("back-to-games").addEventListener("click", () => showView("play"));
  $("save-platform-controls").addEventListener("click", savePlatformControls);
  $("save-content-controls").addEventListener("click", saveContentControls);
  $("save-ai-budgets").addEventListener("click", saveBudgets);
  $("publish-daily").addEventListener("click", publishDaily);
  $("queue-generation").addEventListener("click", queueGeneration);
  $("refresh-jobs").addEventListener("click", () => refreshAdmin().catch((e) => $("admin-jobs").textContent = e.message));
  $("refresh-leadership").addEventListener("click", refreshLeadership);

  initialise();
})();