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

  let client = null, session = null, role = "", gradeLabel = "", lockedOut = false;
  let previewMode = false, previewReason = "";
  let catalog = null, progress = null, leaderboard = [], dailyChallenge = null;
  let currentView = "play", currentGame = "quick_quiz", currentQuestions = [];
  let currentAnswers = [], currentIndex = 0, currentScore = 0, challengeId = null;
  let gameStartedAt = 0, memoryTimer = null, memoryRevealed = false;
  let adminSummary = null, adminOptions = null, adminJobs = [];

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
      if (role !== "Student" && role !== "Admin") {
        showGate("access", "Only linked LIB student accounts and authorised administrators can use Knowledge Arena.");
        setStatus("ACCESS DENIED", "danger");
        return;
      }
      showShell();
      if (role === "Admin") {
        $("welcome-line").textContent = "Monitor Knowledge Arena, manage shared AI budgets and publish daily challenges.";
        $("admin-nav").classList.remove("hidden");
        await loadAdmin();
        const requested = new URLSearchParams(location.search).get("view");
        showView(requested === "admin" ? "admin" : "admin");
      } else {
        $("admin-nav").classList.add("hidden");
        await loadStudent();
        const requested = new URLSearchParams(location.search).get("view");
        showView(requested === "daily" ? "daily" : "play");
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
        usePreview(error.message || "The Knowledge Arena API is not deployed yet.");
      }
    }
  }

  async function loadStudent() {
    setStatus("CONNECTING", "neutral");
    try {
      catalog = await api("get_catalog");
      progress = await api("get_my_progress");
      populateSubjects();
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

  function populateSubjects() {
    const select = $("subject-select");
    if (!select) return;
    const subjects = catalog && catalog.subjects ? catalog.subjects : [];
    select.innerHTML = subjects.length
      ? subjects.map((name) => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join("")
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
    $("leaderboard-rows").innerHTML = [
      ["1","Preview Player A","860"],["2","Preview Player B","740"],["3","You","0"],["4","Preview Player C","510"]
    ].map((r) => '<div class="leader-row"><b class="rank">' + r[0] + '</b><span>' + r[1] + '</span><b>' + r[2] + '</b></div>').join("");
  }
  async function loadLeaderboard() {
    const data = await api("get_leaderboard");
    leaderboard = data.leaderboard || [];
    $("leaderboard-rows").innerHTML = leaderboard.length ? leaderboard.map((r) =>
      '<div class="leader-row ' + (r.is_me ? "you" : "") + '"><b class="rank">' + r.rank +
      '</b><span>' + escapeHtml(r.display_name) + (r.is_me ? "<small>You</small>" : "") +
      '</span><b>' + Number(r.game_xp || 0).toLocaleString("en-IN") + '</b></div>'
    ).join("") : '<p class="muted">No scores yet. Be the first to play!</p>';
  }

  function showView(name) {
    if (name === "admin" && role !== "Admin") return;
    currentView = name;
    ["play","daily","achievements","leaderboard","admin"].forEach((v) => {
      const section = $("view-" + v);
      if (section) section.classList.toggle("hidden", v !== name);
    });
    $("quiz").classList.add("hidden");
    $("results").classList.add("hidden");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "daily" && role === "Student") loadDailyChallenge();
    if (name === "leaderboard" && role === "Student" && !previewMode) loadLeaderboard().catch((e) => note(e.message, "warning"));
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
      const subject = $("subject-select").value;
      if (!subject) { note("Please choose a subject first.", "warning"); return; }
      try {
        const data = await api("get_questions", { game_type: game, subject, limit: 10 });
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
        game_type: currentGame,
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

  async function loadAdmin() {
    setStatus("ADMIN", "success");
    try {
      const [summary, options, jobs] = await Promise.all([
        api("get_admin_summary"), api("get_admin_options"), api("get_admin_jobs")
      ]);
      adminSummary = summary.summary;
      adminOptions = options;
      adminJobs = jobs.jobs || [];
      renderAdmin();
    } catch (error) {
      usePreview("Admin API/database setup is pending: " + error.message);
      $("admin-nav").classList.remove("hidden");
      $("view-admin").classList.remove("hidden");
      $("view-play").classList.add("hidden");
      $("admin-metrics").innerHTML = '<p class="muted">Admin metrics will appear when the Knowledge Arena backend is deployed and the isolated schema is installed.</p>';
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
      ["Generation failures (24h)",a.generation_failures_24h]
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
    renderJobs();
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

  async function refreshAdmin() {
    const [summary, jobs] = await Promise.all([api("get_admin_summary"), api("get_admin_jobs")]);
    adminSummary = summary.summary;
    adminJobs = jobs.jobs || [];
    renderAdmin();
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
  $("save-ai-budgets").addEventListener("click", saveBudgets);
  $("publish-daily").addEventListener("click", publishDaily);
  $("queue-generation").addEventListener("click", queueGeneration);
  $("refresh-jobs").addEventListener("click", () => refreshAdmin().catch((e) => $("admin-jobs").textContent = e.message));

  initialise();
})();