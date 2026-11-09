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
    brain_teaser: "Brain Teaser", memory_challenge: "Memory Challenge",
    world_explorer: "World Explorer", history_quest: "History Quest",
    society_culture_challenge: "Society & Culture Challenge",
    civics_constitution_challenge: "Civics & Constitution Challenge",
    economics_explorer: "Economics Explorer", money_matters: "Money Matters",
    word_builder: "Word Builder", math_sprint: "Math Sprint"
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
  let guestMode = false, guestTokenValue = "", guestGameCount = 0, guestExitPending = false;
  const LANGUAGE_OPTIONS = { en: "English", hi: "Hindi", kn: "Kannada", sa: "Sanskrit", fr: "French" };
  let previewMode = false, previewReason = "";
  let catalog = null, progress = null, leaderboard = [], dailyChallenge = null;
  let currentView = "play", currentGame = "quick_quiz", currentQuestions = [];
  let currentAnswers = [], currentIndex = 0, currentScore = 0, challengeId = null, clientAttemptId = null;
  let gameStartedAt = 0, memoryTimer = null, memoryRevealed = false;
  let adminSummary = null, adminOptions = null, adminJobs = [], adminUsageReviews = [], adminLeadership = null, adminQuestions = [], adminSuitability = null;
  let adminGuestLeads = [], adminGuestPromotions = [];

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
    const isGuestAction = String(action).startsWith("guest_");
    if (!isGuestAction && lockedOut) throw new Error("This tab has been signed out. Please sign in again through My LIB.");
    let authorization = SUPABASE_ANON_KEY;
    if (!isGuestAction) {
      const { data: authData, error: authError } = await client.auth.getSession();
      if (authError || !authData.session) throw new Error("Your LIB login has expired. Please sign in again.");
      session = authData.session; authorization = session.access_token;
    }
    const guestPayload = isGuestAction && guestTokenValue && !["guest_register","guest_options"].includes(action) ? { guest_token: guestTokenValue } : {};
    const response = await fetch(API_URL, { method: "POST", headers: {
      "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + authorization
    }, body: JSON.stringify({ action, ...guestPayload, ...payload }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message || "Knowledge Arena service returned " + response.status + ".";
      const error = new Error(message); error.status = response.status; throw error;
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
    if (error || !data.session) { await initialiseGuest(); return; }
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
      const isLearningRole = role === "Student" || role === "Teacher";
      const backToLearning = $("back-learning");
      const supportButton = $("knowledge-arena-support");
      if (backToLearning) backToLearning.classList.toggle("hidden", !isLearningRole);
      if (supportButton) supportButton.classList.toggle("hidden", !isLearningRole);
      gradeLabel = context.grade_label || "";
      assignedGradeLabel = gradeLabel;
      if (role !== "Student" && role !== "Teacher" && role !== "Admin") {
        showGate("access", "Knowledge Arena is available to linked LIB students, teachers and authorised administrators.");
        setStatus("ACCESS DENIED", "danger");
        return;
      }
      showShell();
      if (role === "Admin") {
        $("welcome-line").textContent = "Manage Knowledge Arena or enter player mode to play at a selected grade.";
        prepareAdminLayout();
        await loadAdmin();
        const requested = new URLSearchParams(location.search).get("view");
        showView(requested === "play" ? "play" : "admin");
      } else if (role === "Teacher") {
        prepareTeacherLayout();
        await loadRolePlayer();
        showView("play");
      } else {
        $("admin-nav").classList.add("hidden");
        $("admin-play-nav").classList.add("hidden");
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

  function showGuestGate() {
    $("guest-gate").classList.remove("hidden"); $("auth-gate").classList.add("hidden");
    $("access-gate").classList.add("hidden"); $("arena-shell").classList.add("hidden");
  }
  async function initialiseGuest() {
    guestMode = true; role = "Guest"; setStatus("GUEST", "success");
    try {
      const saved = localStorage.getItem("ka_guest_token");
      if (saved) {
        guestTokenValue = saved;
        try { const resumed = await api("guest_resume"); gradeLabel = resumed.grade_label || ""; await loadGuest(); return; }
        catch (e) { localStorage.removeItem("ka_guest_token"); guestTokenValue = ""; }
      }
      const options = await api("guest_options");
      $("guest-grade").innerHTML = '<option value="">Select your grade</option>' + (options.grades || []).map(x => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
      if (!options.games_enabled) { $("guest-register-feedback").textContent = "Games are temporarily paused. Please try again later."; $("guest-start-button").disabled = true; } else { $("guest-start-button").disabled = false; }
      showGuestGate();
    } catch (e) { showGuestGate(); $("guest-register-feedback").textContent = e.message || "Guest access is temporarily unavailable."; setStatus("UNAVAILABLE","danger"); }
  }
  async function registerGuest(event) {
    event.preventDefault();
    const feedback=$("guest-register-feedback"), button=$("guest-start-button"), mobile=$("guest-mobile").value.replace(/\\D/g,"");
    if (!/^[6-9]\\d{9}$/.test(mobile)) { feedback.textContent="Enter a valid 10-digit Indian mobile number."; return; }
    feedback.textContent="Starting your guest session…"; button.disabled=true;
    try {
      const r=await api("guest_register",{guest_name:$("guest-name").value.trim(),mobile_number:mobile,grade_label:$("guest-grade").value,enquiry_consent:$("guest-enquiry-consent").checked,marketing_consent:$("guest-marketing-consent").checked});
      guestTokenValue=r.guest_token; localStorage.setItem("ka_guest_token",guestTokenValue); gradeLabel=r.grade_label||"";
      guestMode=true; await loadGuest(); showGuestPromotion("welcome");
    } catch(e) { feedback.textContent=e.message||"Could not start your guest session."; }
    finally { button.disabled=false; }
  }
  async function loadGuest() {
    const data=await api("guest_catalog"); catalog=data; gradeLabel=data.grade_label||gradeLabel;
    $("guest-gate").classList.add("hidden"); showShell();
    $("main-nav").querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("hidden",b.id!=="play-nav"));
    $("hero-xp").closest(".hero-score").classList.add("hidden");
    $("guest-exit").classList.remove("hidden");
    $("welcome-line").textContent="Welcome to Knowledge Arena. Choose a game and start learning!";
    $("grade-label").textContent="Your selected class: "+gradeLabel;
    renderGameAvailability(data.games||[]); if(!data.games_enabled) note("Knowledge Arena games are temporarily paused by Admin. Please return later.","warning"); setStatus("GUEST PLAY","success"); showView("play");
  }
  async function showGuestPromotion(trigger,gameType="",subject="") {
    if(!guestMode)return;
    if(trigger==="after_game"){guestGameCount++;if(guestGameCount!==1&&guestGameCount%3!==1)return;}
    const key="ka_guest_promos_"+trigger; let shown=[];
    try{shown=JSON.parse(sessionStorage.getItem(key)||"[]");}catch(e){}
    try{
      const r=await api("guest_promotions",{trigger,game_type:gameType,subject});
      const p=(r.promotions||[]).find(x=>!shown.includes(x.id)); if(!p)return;
      $("guest-promotion-heading").textContent=p.title; $("guest-promotion-copy").textContent=p.body;
      $("guest-promotion-cta").textContent=p.cta_label; $("guest-promotion-cta").href=p.cta_url;
      const img=$("guest-promotion-image"); if(p.image_url){img.src=p.image_url;img.classList.remove("hidden");}else{img.removeAttribute("src");img.classList.add("hidden");}
      $("guest-promotion-modal").dataset.promotionId=p.id; $("guest-promotion-modal").classList.remove("hidden");
      shown.push(p.id);sessionStorage.setItem(key,JSON.stringify(shown));
      await api("guest_promotion_event",{promotion_id:p.id,event_type:"view"});
    }catch(e){}
  }
  async function closeGuestPromotion(type) {
    const modal=$("guest-promotion-modal"),id=modal.dataset.promotionId;modal.classList.add("hidden");
    if(id){try{await api("guest_promotion_event",{promotion_id:id,event_type:type});}catch(e){}}
    if(guestExitPending) await finishGuestExit();
  }
  async function finishGuestExit() {
    try { if(guestTokenValue) await api("guest_end"); } catch(e) {}
    guestExitPending=false; guestTokenValue=""; guestMode=false; guestGameCount=0;
    try { localStorage.removeItem("ka_guest_token"); } catch(e) {}
    $("guest-exit").classList.add("hidden"); $("guest-promotion-modal").classList.add("hidden");
    $("guest-register-feedback").textContent=""; showGuestGate();
    try { const options=await api("guest_options"); $("guest-grade").innerHTML='<option value="">Select your grade</option>'+(options.grades||[]).map(x=>'<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>').join(""); } catch(e) {}
  }
  async function exitGuest() {
    guestExitPending=true;
    await showGuestPromotion("exit");
    if($("guest-promotion-modal").classList.contains("hidden")) await finishGuestExit();
  }

  async function loadStudent() {
    setStatus("CONNECTING", "neutral");
    try {
      catalog = await api("get_catalog");
      if (catalog.grade_label) gradeLabel = catalog.grade_label;
      progress = await api("get_my_progress");
      configureLanguageChoice();
      configureTinaGradeChoice();
      renderGameAvailability(catalog.games || []);
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
      catalog = await api("get_catalog");
      renderGameAvailability(catalog.games || []);
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

  function populateSubjects() { /* Subject selection is intentionally hidden from players. */ }

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
    document.querySelectorAll("#main-nav .nav-btn:not(#admin-nav):not(#admin-play-nav)").forEach((button) => button.classList.add("hidden"));
    $("admin-nav").classList.remove("hidden");
    $("admin-play-nav").classList.remove("hidden");
  }

  function prepareTeacherLayout() {
    ["daily","progress","achievements","leaderboard","admin"].forEach((v) => {
      const button = document.querySelector('#main-nav .nav-btn[data-view="' + v + '"]');
      if (button) button.classList.add("hidden");
    });
    $("player-grade-choice").classList.remove("hidden");
  }

  async function loadRolePlayer() {
    try {
      const options = await api("get_catalog");
      catalog = options;
      const select = $("player-grade-select");
      select.innerHTML = '<option value="">Select a grade</option>' +
        (options.available_grade_options || []).map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
      $("player-grade-choice").classList.remove("hidden");
      const remembered = sessionStorage.getItem("ka_player_grade") || "";
      if (remembered && (options.available_grade_options || []).includes(remembered)) {
        select.value = remembered;
        await loadRolePlayerGrade(remembered);
      } else {
        gradeLabel = "";
        renderGameAvailability([]);
        note("Select a grade to see the games and questions suitable for that level.", "info");
      }
    } catch (error) { note(error.message, "warning"); }
  }

  async function loadRolePlayerGrade(value) {
    if (!value) { gradeLabel = ""; renderGameAvailability([]); return; }
    try {
      sessionStorage.setItem("ka_player_grade", value);
      catalog = await api("get_catalog", { grade_label: value });
      gradeLabel = catalog.grade_label || value;
      renderGameAvailability(catalog.games || []);
      $("grade-label").textContent = "Player grade: " + gradeLabel;
      $("welcome-line").textContent = "Playing at " + gradeLabel + " level. This selection does not change your LIB profile.";
      hideNote();
    } catch (error) { note(error.message, "warning"); }
  }

  function renderGameAvailability(games) {
    const enabledGames = new Set((games || []).map((game) => game.id));
    document.querySelectorAll(".game-card").forEach((card) => {
      const launch = card.querySelector(".launch");
      if (!launch) return;
      const enabled = enabledGames.has(launch.dataset.game);
      card.classList.toggle("game-unavailable", !enabled);
      launch.disabled = !enabled;
      if (!enabled) launch.textContent = "Questions being prepared";
      else launch.textContent = "Play now →";
    });
  }

  function showView(name) {
    if (name === "admin" && role !== "Admin" && role !== "AdminPreview") return;
    if (name === "play" && (role === "Teacher" || role === "Admin") && !gradeLabel) {
      $("player-grade-choice").classList.remove("hidden");
    }
    currentView = name;
    ["play","daily","progress","achievements","leaderboard","admin"].forEach((v) => {
      const section = $("view-" + v);
      if (section) section.classList.toggle("hidden", v !== name);
    });
    $("quiz").classList.add("hidden");
    $("results").classList.add("hidden");
    $("guest-register-form").addEventListener("submit", registerGuest);
  $("guest-exit").addEventListener("click",exitGuest);
  $("guest-promotion-close").addEventListener("click",()=>closeGuestPromotion("dismiss"));
  $("guest-promotion-dismiss").addEventListener("click",()=>closeGuestPromotion("dismiss"));
  $("guest-promotion-cta").addEventListener("click",()=>closeGuestPromotion("click"));
  $("refresh-guest-leads").addEventListener("click",()=>refreshGuestLeads().catch(e=>$("guest-lead-feedback").textContent=e.message));
  $("export-guest-leads").addEventListener("click",exportGuestLeads);
  $("guest-lead-search").addEventListener("keydown",e=>{if(e.key==="Enter")refreshGuestLeads().catch(err=>$("guest-lead-feedback").textContent=err.message);});
  $("guest-lead-status").addEventListener("change",()=>refreshGuestLeads().catch(e=>$("guest-lead-feedback").textContent=e.message));
  $("guest-lead-list").addEventListener("click",e=>{const b=e.target.closest("[data-open-guest-lead]");if(b)openGuestLead(b.dataset.openGuestLead);});
  $("guest-lead-detail").addEventListener("click",e=>{const b=e.target.closest("[data-export-guest-leads]");if(b)exportGuestLeads();});
  $("guest-promotion-form").addEventListener("submit",saveGuestPromotion);
  $("promotion-reset").addEventListener("click",resetPromotionForm);
  $("refresh-guest-promotions").addEventListener("click",()=>refreshGuestPromotions().catch(e=>$("guest-promotion-feedback").textContent=e.message));
  $("guest-promotion-list").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-promotion]"),del=e.target.closest("[data-delete-promotion]");if(edit)editGuestPromotion(edit.dataset.editPromotion);if(del)deleteGuestPromotion(del.dataset.deletePromotion);});
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "daily" && role === "Student") loadDailyChallenge();
    if ((name === "leaderboard" || name === "achievements") && role === "Student" && !previewMode) loadLeaderboard().catch((e) => note(e.message, "warning"));
    if (name === "play" && role === "Admin" && !catalog?.available_grade_options?.length) loadRolePlayer();
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
      if (role === "Teacher" || role === "Admin") {
        if (!gradeLabel) { note("Select a grade before starting a game.", "warning"); showView("play"); return; }
      }
      const isLanguageStudent = assignedGradeLabel.trim().toLocaleLowerCase() === "language";
      const payload = { game_type: game, limit: 10 };
      if (role === "Teacher" || role === "Admin") payload.grade_label = gradeLabel;
      if (isLanguageStudent && ["word_master","word_builder"].includes(game)) payload.language_code = $("language-select").value;
      try {
        const data = guestMode ? await api("guest_questions", { game_type: game }) : await api("get_questions", payload);
        currentQuestions = (data.questions || []).sort(() => Math.random() - 0.5);
        if (!currentQuestions.length) {
          note("There are no approved questions for " + GAME_NAMES[game] + " at this grade yet. More questions can be generated from the Admin control centre.", "info");
          return;
        }
        gradeLabel = data.grade_label || gradeLabel;
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
    if (guestMode) {
      try {
        const result=await api("guest_submit",{game_type:currentGame,client_attempt_id:clientAttemptId,answers:currentAnswers,duration_seconds:Math.max(0,Math.round((Date.now()-gameStartedAt)/1000))});
        currentScore=Number(result.correct_count||0);
        $("result-score").textContent=currentScore+" / "+Number(result.question_count||currentQuestions.length);
        $("result-title").textContent=currentScore===currentQuestions.length?"Perfect score!":currentScore>=Math.ceil(currentQuestions.length*.6)?"Well played!":"Good effort!";
        $("result-message").textContent="Accuracy: "+result.accuracy+"%. Guest results are not added to student XP or leaderboards.";
        const feedback=new Map((result.feedback||[]).map(x=>[x.question_id,x]));
        $("result-review").innerHTML=currentQuestions.map((q,i)=>{const item=feedback.get(q.id);if(!item)return "";const answer=q.options&&q.options[item.correct_option]?q.options[item.correct_option]:"";return '<div class="result-review-item"><b>'+(i+1)+". "+(item.correct?"Correct":"Incorrect")+'</b>'+(!item.correct&&answer?'<p><strong>Correct answer:</strong> '+escapeHtml(answer)+'</p>':'')+'<p>'+escapeHtml(item.explanation||"")+'</p></div>';}).join("");
        $("quiz").classList.add("hidden");$("results").classList.remove("hidden");$("next-question").disabled=false;
        showGuestPromotion("after_game",currentGame,currentQuestions[0]?.subject||"");
      } catch(e) {$("next-question").disabled=false;$("quiz-feedback").textContent="We could not save this guest result: "+e.message+". Please retry.";$("next-question").textContent="Retry submission";$("next-question").classList.remove("hidden");}
      return;
    }
    try {
      const payload = {
        client_attempt_id: clientAttemptId,
        game_type: currentGame,
        answers: currentAnswers,
        duration_seconds: Math.max(0, Math.round((Date.now() - gameStartedAt) / 1000))
      };
      if (challengeId) payload.challenge_id = challengeId;
      if (role === "Teacher" || role === "Admin") payload.grade_label = gradeLabel;
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
      if (role === "Student") {
        progress = await api("get_my_progress");
        renderProgress();
        renderAchievements();
        await loadLeaderboard();
      }
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
      const [summary, options, jobs, usage, questions, suitability] = await Promise.all([
        api("get_admin_summary"), api("get_admin_options"), api("get_admin_jobs"), api("get_admin_usage_reviews"), api("get_admin_questions"), api("get_admin_suitability")
      ]);
      adminSummary = summary.summary;
      adminOptions = options;
      adminJobs = jobs.jobs || [];
      adminUsageReviews = usage.reviews || [];
      renderAdmin();
      await refreshLeadership();
      await Promise.all([refreshGuestLeads(), refreshGuestPromotions()]);
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
    // The catalogue can contain the same subject once per grade/language offering.
    // Platform subject controls are global, so render each normalized subject only once.
    const uniqueSubjects = [...new Map(subjects
      .map((subject) => String(subject || "").trim())
      .filter(Boolean)
      .map((subject) => [subject.toLocaleLowerCase(), subject])).values()]
      .sort((left, right) => left.localeCompare(right));
    $("queue-grade").innerHTML = [...new Set(["General", ...grades])].map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
    $("queue-subject").innerHTML = uniqueSubjects.map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
    const disabledGames = new Set(settings.disabled_game_types || []);
    const disabledSubjects = new Set((settings.disabled_subjects || []).map((subject) => String(subject || "").trim().toLocaleLowerCase()));
    const gameTypes = adminOptions && adminOptions.game_types ? adminOptions.game_types : Object.keys(GAME_NAMES);
    $("admin-game-switches").innerHTML = gameTypes.map((id) =>
      '<label><input type="checkbox" data-disable-game="' + escapeHtml(id) + '" ' + (disabledGames.has(id) ? 'checked' : '') + '> ' + escapeHtml(GAME_NAMES[id] || id) + '</label>'
    ).join("");
    $("admin-subject-switches").innerHTML = uniqueSubjects.map((subject) =>
      '<label><input type="checkbox" data-disable-subject="' + escapeHtml(subject) + '" ' + (disabledSubjects.has(subject.toLocaleLowerCase()) ? 'checked' : '') + '> ' + escapeHtml(subject) + '</label>'
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

  function renderSuitability() {
    if (!adminSuitability) return;
    const s = adminSuitability;
    const fill = (id, values, current) => {
      const el = $(id);
      const selected = current || el.value;
      el.innerHTML = values.map((x) => '<option value="' + escapeHtml(x) + '">' + escapeHtml(x) + '</option>').join("");
      if (values.includes(selected)) el.value = selected;
    };
    fill("suitability-grade", s.grades || [], $("suitability-grade").value || s.grades?.[0]);
    fill("suitability-game-grade", s.grades || [], $("suitability-game-grade").value || s.grades?.[0]);
    fill("suitability-game", (s.games || []).map((x) => x.id), $("suitability-game").value || s.games?.[0]?.id);
    const grade = $("suitability-grade").value;
    const gameGrade = $("suitability-game-grade").value;
    const game = $("suitability-game").value;
    const gs = new Set((s.grade_subject_rules || []).filter((x) => x.grade_label === grade && x.enabled).map((x) => x.subject.toLocaleLowerCase()));
    const gg = new Set((s.game_grade_rules || []).filter((x) => x.grade_label === gameGrade && x.enabled).map((x) => x.game_type));
    const gsr = new Set((s.game_subject_rules || []).filter((x) => x.game_type === game && x.enabled).map((x) => x.subject.toLocaleLowerCase()));
    $("suitability-subject-list").innerHTML = (s.subjects || []).filter((x) => x.toLocaleLowerCase() !== "all").map((x) =>
      '<label><input type="checkbox" data-suitability="grade_subject" data-subject="' + escapeHtml(x) + '" ' +
      (gs.has(x.toLocaleLowerCase()) ? 'checked' : '') + '> ' + escapeHtml(x) + '</label>').join("");
    $("suitability-game-grade-list").innerHTML = (s.games || []).map((x) =>
      '<label><input type="checkbox" data-suitability="game_grade" data-game="' + escapeHtml(x.id) + '" ' +
      (gg.has(x.id) ? 'checked' : '') + '> ' + escapeHtml(x.name) + '</label>').join("");
    $("suitability-game-subject-list").innerHTML = (s.subjects || []).filter((x) => x.toLocaleLowerCase() !== "all").map((x) =>
      '<label><input type="checkbox" data-suitability="game_subject" data-subject="' + escapeHtml(x) + '" ' +
      (gsr.has(x.toLocaleLowerCase()) ? 'checked' : '') + '> ' + escapeHtml(x) + '</label>').join("");
  }

  async function saveSuitabilityToggle(event) {
    const input = event.target.closest("[data-suitability]");
    if (!input || !adminSuitability) return;
    const kind = input.dataset.suitability;
    const payload = { kind, enabled: input.checked };
    if (kind === "grade_subject") { payload.grade_label = $("suitability-grade").value; payload.subject = input.dataset.subject; }
    if (kind === "game_grade") { payload.grade_label = $("suitability-game-grade").value; payload.game_type = input.dataset.game; }
    if (kind === "game_subject") { payload.game_type = $("suitability-game").value; payload.subject = input.dataset.subject; }
    const feedback = $("suitability-feedback");
    feedback.textContent = "Saving suitability…";
    input.disabled = true;
    try {
      await api("set_suitability", payload);
      feedback.textContent = "Suitability updated.";
      const data = await api("get_admin_suitability");
      adminSuitability = data;
      renderSuitability();
    } catch (error) {
      input.checked = !input.checked;
      feedback.textContent = error.message;
    } finally { input.disabled = false; }
  }

  function populateQuestionFilters() {
    const grades = adminOptions?.grades || [];
    const subjects = adminOptions?.subjects || [];
    const games = adminOptions?.game_types || Object.keys(GAME_NAMES);
    const fill = (id, items, first) => {
      const el = $(id);
      if (!el) return;
      const current = el.value;
      el.innerHTML = '<option value="">' + first + '</option>' + items.map((x) =>
        '<option value="' + escapeHtml(x) + '">' + escapeHtml(GAME_NAMES[x] || x) + '</option>').join("");
      if ([...el.options].some((o) => o.value === current)) el.value = current;
    };
    fill("review-grade", grades, "All grades");
    fill("review-subject", subjects, "All subjects");
    fill("review-game", games, "All games");
  }

  function renderQuestionBank() {
    const grade = $("review-grade")?.value || "";
    const subject = $("review-subject")?.value || "";
    const game = $("review-game")?.value || "";
    const status = $("review-status")?.value || "";
    const rows = adminQuestions.filter((q) =>
      (!grade || q.grade_label === grade) && (!subject || q.subject === subject) &&
      (!game || q.game_type === game) && (!status || q.status === status));
    if (!rows.length) { $("admin-question-list").innerHTML = '<p class="muted">No questions match these filters.</p>'; return; }
    $("admin-question-list").innerHTML = rows.map((q) => {
      const options = Array.isArray(q.options) ? q.options : [];
      return '<details class="admin-question" data-question-id="' + escapeHtml(q.id) + '">' +
        '<summary><b>' + escapeHtml(q.subject) + ' · ' + escapeHtml(q.grade_label) + '</b><span>' +
        escapeHtml(GAME_NAMES[q.game_type] || q.game_type) + ' · ' + escapeHtml(q.status) + '</span><small>' +
        escapeHtml(q.prompt) + '</small></summary><div class="admin-question-edit">' +
        '<label>Question<textarea data-field="prompt" rows="3">' + escapeHtml(q.prompt) + '</textarea></label>' +
        '<label>Topic<input data-field="topic" value="' + escapeHtml(q.topic) + '"></label>' +
        '<div class="admin-question-options">' + [0,1,2,3].map((i) =>
          '<label>Option ' + (i+1) + '<input data-option="' + i + '" value="' + escapeHtml(options[i] || "") + '"></label>').join("") + '</div>' +
        '<label>Correct answer<select data-field="correct_option">' + [0,1,2,3].map((i) =>
          '<option value="' + i + '" ' + (Number(q.correct_option) === i ? 'selected' : '') + '>Option ' + (i+1) + '</option>').join("") + '</select></label>' +
        '<label>Explanation<textarea data-field="explanation" rows="2">' + escapeHtml(q.explanation) + '</textarea></label>' +
        '<label>Difficulty<select data-field="difficulty">' + ["easy","medium","hard"].map((x) =>
          '<option value="' + x + '" ' + (q.difficulty === x ? 'selected' : '') + '>' + x + '</option>').join("") + '</select></label>' +
        '<div class="admin-question-actions"><button class="btn-secondary" data-question-action="save">Save changes</button>' +
        (q.status !== "published" ? '<button class="btn-secondary" data-question-action="publish">Publish</button>' : '') +
        '<button class="btn-secondary" data-question-action="archive">Remove from play</button>' +
        '<button class="btn-secondary" data-question-action="delete">Delete permanently</button></div></div></details>';
    }).join("");
  }

  async function refreshQuestions() {
    const feedback = $("question-feedback");
    feedback.textContent = "Loading questions…";
    try {
      const data = await api("get_admin_questions");
      adminQuestions = data.questions || [];
      populateQuestionFilters();
      renderQuestionBank();
      feedback.textContent = "Loaded " + adminQuestions.length + " recent questions.";
    } catch (error) { feedback.textContent = error.message; }
  }

  async function handleQuestionAction(event) {
    const button = event.target.closest("[data-question-action]");
    if (!button) return;
    const row = button.closest("[data-question-id]");
    if (!row) return;
    const id = row.dataset.questionId;
    const operation = button.dataset.questionAction;
    const feedback = $("question-feedback");
    if (operation === "delete" && !window.confirm("Permanently delete this question? Historical aggregate attempts and XP are retained.")) return;
    button.disabled = true;
    feedback.textContent = operation === "save" ? "Saving question…" : operation === "archive" ? "Removing question from play…" : "Deleting question…";
    try {
      const payload = { operation, question_id: id };
      if (operation === "save") {
        payload.prompt = row.querySelector('[data-field="prompt"]').value;
        payload.topic = row.querySelector('[data-field="topic"]').value;
        payload.options = [0,1,2,3].map((i) => row.querySelector('[data-option="' + i + '"]').value);
        payload.correct_option = Number(row.querySelector('[data-field="correct_option"]').value);
        payload.explanation = row.querySelector('[data-field="explanation"]').value;
        payload.difficulty = row.querySelector('[data-field="difficulty"]').value;
      }
      await api("admin_question", payload);
      feedback.textContent = operation === "delete" ? "Question deleted." : operation === "archive" ? "Question removed from play." : operation === "publish" ? "Question published." : "Question updated.";
      await refreshQuestions();
    } catch (error) { feedback.textContent = error.message; button.disabled = false; }
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
  async function refreshGuestLeads() {
    const status=$("guest-lead-feedback"); if(status) status.textContent="Loading guest leads…";
    const result=await api("get_admin_guest_leads",{status:$("guest-lead-status").value,search:$("guest-lead-search").value.trim(),limit:100});
    adminGuestLeads=result.leads||[];
    const total=result.total||0, newCount=adminGuestLeads.filter(x=>x.lead_status==="New").length;
    const demoCount=adminGuestLeads.filter(x=>["Demo Booked","Demo Completed"].includes(x.lead_status)).length;
    $("guest-lead-metrics").innerHTML=[["Total matching",total],["New in this view",newCount],["Demo booked / completed",demoCount]].map(x=>'<article class="metric"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></article>').join("");
    $("guest-lead-list").innerHTML=adminGuestLeads.length?'<div class="guest-lead-table">'+
      '<div class="guest-lead-row guest-lead-head"><span>Guest / mobile</span><span>Grade</span><span>Sessions / games</span><span>Status</span><span>Last seen</span><span></span></div>'+
      adminGuestLeads.map(x=>'<div class="guest-lead-row"><span><b>'+escapeHtml(x.last_guest_name||"Guest")+'</b><small>'+escapeHtml(x.mobile_e164)+'</small></span><span>'+escapeHtml(x.last_grade_label||"—")+'</span><span>'+x.sessions_count+' / '+x.games_completed+'</span><span>'+escapeHtml(x.lead_status)+'</span><span>'+escapeHtml(new Date(x.last_seen_at).toLocaleString("en-IN"))+'</span><span><button class="text-btn" data-open-guest-lead="'+x.id+'">View</button></span></div>').join("")+'</div>':'<p class="muted">No guest leads match these filters.</p>';
    if(status) status.textContent=total+" guest lead(s) found.";
  }
  async function openGuestLead(id) {
    const panel=$("guest-lead-detail"); panel.classList.remove("hidden"); panel.textContent="Loading lead details…";
    try {
      const d=await api("get_admin_guest_lead_detail",{lead_id:id}), l=d.lead;
      panel.innerHTML='<div class="admin-panel-head"><h3>'+escapeHtml(l.last_guest_name||"Guest lead")+' · '+escapeHtml(l.mobile_e164)+'</h3><button class="text-btn" id="close-guest-lead">Close</button></div>'+
        '<p class="muted">First seen: '+escapeHtml(new Date(l.first_seen_at).toLocaleString("en-IN"))+' · Last seen: '+escapeHtml(new Date(l.last_seen_at).toLocaleString("en-IN"))+'</p>'+
        '<p>Enquiry consent: <b>'+ (l.enquiry_consent?"Yes":"No")+'</b> · WhatsApp marketing consent: <b>'+(l.marketing_consent?"Yes":"No")+'</b></p>'+
        '<h4>Guest sessions</h4><div class="guest-detail-list">'+(d.sessions||[]).map(x=>'<p><b>'+escapeHtml(x.guest_name)+'</b> · '+escapeHtml(x.grade_label)+' · '+escapeHtml(new Date(x.started_at).toLocaleString("en-IN"))+'</p>').join("")+'</div>'+
        '<h4>Game activity</h4><div class="guest-detail-list">'+(d.activity||[]).map(x=>'<p>'+escapeHtml(GAME_NAMES[x.game_type]||x.game_type)+' · '+escapeHtml(x.subject||"")+' · '+x.correct_count+'/'+x.question_count+' correct · '+escapeHtml(new Date(x.completed_at).toLocaleString("en-IN"))+'</p>').join("")+'</div>'+
        '<h4>Consent history</h4><div class="guest-detail-list">'+(d.consents||[]).map(x=>'<p>'+escapeHtml(x.consent_type)+' · '+(x.granted?"Granted":"Withdrawn")+' · '+escapeHtml(new Date(x.recorded_at).toLocaleString("en-IN"))+'</p>').join("")+'</div>'+
        '<h4>Promotion engagement</h4><div class="guest-detail-list">'+(d.promotion_events||[]).map(x=>'<p>'+escapeHtml(x.event_type)+' · '+escapeHtml(x.promotion_id)+' · '+escapeHtml(new Date(x.created_at).toLocaleString("en-IN"))+'</p>').join("")+'</div>'+
        '<h4>Follow-up notes</h4><div class="guest-detail-list">'+(d.notes||[]).map(x=>'<p>'+escapeHtml(x.note)+' <small>'+escapeHtml(new Date(x.created_at).toLocaleString("en-IN"))+'</small></p>').join("")+'</div>'+
        '<div class="guest-lead-edit"><label>Lead status<select id="guest-detail-status">'+["New","Contacted","Interested","Demo Booked","Demo Completed","Converted to Student","Not Interested"].map(x=>'<option '+(x===l.lead_status?"selected":"")+'>'+x+'</option>').join("")+'</select></label>'+
        '<label>LIB Student ID (optional, for conversion)<input id="guest-detail-student" value="'+escapeHtml(l.converted_student_id||"")+'" placeholder="Existing student UUID"></label>'+
        '<label>Follow-up note<textarea id="guest-detail-note" rows="3" maxlength="2000" placeholder="Add an internal note"></textarea></label>'+
        '<button class="btn-secondary" id="save-guest-lead" data-lead-id="'+l.id+'">Save follow-up</button>'+
        (l.enquiry_consent||l.marketing_consent?'<a class="btn-secondary" href="https://wa.me/'+encodeURIComponent(l.mobile_e164.replace("+",""))+'" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>':'<small class="muted">No contact consent recorded. Do not send promotional messages.</small>')+'</div>';
      $("close-guest-lead").addEventListener("click",()=>panel.classList.add("hidden"));
      $("save-guest-lead").addEventListener("click",async()=>{
        const b=$("save-guest-lead");b.disabled=true;
        try{await api("admin_update_guest_lead",{lead_id:id,lead_status:$("guest-detail-status").value,converted_student_id:$("guest-detail-student").value.trim()||null,note:$("guest-detail-note").value.trim()});$("guest-lead-feedback").textContent="Lead updated.";await refreshGuestLeads();await openGuestLead(id);}
        catch(e){$("guest-lead-feedback").textContent=e.message;}finally{b.disabled=false;}
      });
    } catch(e){panel.textContent=e.message;}
  }
  function csvCell(value){return '"'+String(value??"").replace(/"/g,'""')+'"';}
  function exportGuestLeads() {
    const rows=[["Name","Mobile","Grade","Status","First seen","Last seen","Sessions","Games","Enquiry consent","WhatsApp marketing consent"]];
    adminGuestLeads.forEach(x=>rows.push([x.last_guest_name,x.mobile_e164,x.last_grade_label,x.lead_status,x.first_seen_at,x.last_seen_at,x.sessions_count,x.games_completed,x.enquiry_consent,x.marketing_consent]));
    const blob=new Blob([rows.map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="knowledge-arena-guest-leads.csv";a.click();URL.revokeObjectURL(url);
  }
  async function refreshGuestPromotions() {
    const r=await api("get_admin_guest_promotions");adminGuestPromotions=r.promotions||[];
    $("guest-promotion-list").innerHTML=adminGuestPromotions.length?adminGuestPromotions.map(p=>'<div class="guest-promotion-admin-row"><div><b>'+escapeHtml(p.title)+'</b><small>'+escapeHtml(p.trigger)+' · '+(p.active?"Active":"Inactive")+' · Views '+p.metrics.view+' · Clicks '+p.metrics.click+'</small></div><div><button class="text-btn" data-edit-promotion="'+p.id+'">Edit</button> <button class="text-btn" data-delete-promotion="'+p.id+'">Deactivate</button></div></div>').join(""):'<p class="muted">No promotions configured yet.</p>';
  }
  function resetPromotionForm() {
    $("guest-promotion-form").reset();$("promotion-id").value="";$("promotion-cta-label").value="Explore courses";$("promotion-order").value="100";
  }
  async function saveGuestPromotion(event) {
    event.preventDefault();const feedback=$("guest-promotion-feedback");feedback.textContent="Saving…";
    const list=id=>$(id).value.split(",").map(x=>x.trim()).filter(Boolean);
    try{
      await api("admin_save_guest_promotion",{id:$("promotion-id").value||null,title:$("promotion-title").value.trim(),body:$("promotion-body").value.trim(),image_url:$("promotion-image").value.trim(),cta_label:$("promotion-cta-label").value.trim(),cta_url:$("promotion-cta-url").value.trim(),trigger:$("promotion-trigger").value,target_grades:list("promotion-grades"),target_game_types:list("promotion-games"),target_subjects:list("promotion-subjects"),display_order:Number($("promotion-order").value),active:$("promotion-active").checked});
      feedback.textContent="Promotion saved.";resetPromotionForm();await refreshGuestPromotions();
    }catch(e){feedback.textContent=e.message;}
  }
  function editGuestPromotion(id) {
    const p=adminGuestPromotions.find(x=>x.id===id);if(!p)return;
    $("promotion-id").value=p.id;$("promotion-title").value=p.title;$("promotion-body").value=p.body;$("promotion-image").value=p.image_url||"";
    $("promotion-cta-label").value=p.cta_label;$("promotion-cta-url").value=p.cta_url;$("promotion-trigger").value=p.trigger;
    $("promotion-grades").value=(p.target_grades||[]).join(", ");$("promotion-games").value=(p.target_game_types||[]).join(", ");
    $("promotion-subjects").value=(p.target_subjects||[]).join(", ");$("promotion-order").value=p.display_order;$("promotion-active").checked=!!p.active;
    $("guest-promotions-panel").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function deleteGuestPromotion(id) {
    if(!confirm("Deactivate this guest promotion? Its reporting history will be retained."))return;
    try{await api("admin_delete_guest_promotion",{id});await refreshGuestPromotions();}catch(e){$("guest-promotion-feedback").textContent=e.message;}
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
  $("refresh-questions").addEventListener("click", refreshQuestions);
  ["review-grade","review-subject","review-game","review-status"].forEach((id) => $(id).addEventListener("change", renderQuestionBank));
  $("admin-question-list").addEventListener("click", handleQuestionAction);
  ["suitability-grade","suitability-game-grade","suitability-game"].forEach((id) => $(id).addEventListener("change", renderSuitability));
  ["suitability-subject-list","suitability-game-grade-list","suitability-game-subject-list"].forEach((id) => $(id).addEventListener("change", saveSuitabilityToggle));
  $("player-grade-select").addEventListener("change", (event) => loadRolePlayerGrade(event.target.value));
  $("refresh-leadership").addEventListener("click", refreshLeadership);

  initialise();
})();