/* MY LIB Help & Search — local, zero-AI-cost navigation and task finder. */
(function () {
  'use strict';
  if (window.__libHelpSearchInstalled) return;
  window.__libHelpSearchInstalled = true;

  const TASKS = [
    { key: 'fees', title: 'Raise or send a fee request', terms: ['fee request', 'fee requests', 'raise fee', 'send fee', 'collect fees', 'request payment', 'payment reminder'], help: 'Open Fees, then use the Raise fee requests area. The existing Fee requests help explains the calculation, payment status and family WhatsApp message.' },
    { key: 'log', title: 'Mark or review class attendance', terms: ['attendance', 'mark attendance', 'class attendance', 'take attendance', 'class log', 'classes held'], help: 'Open Class Log to work with scheduled classes and attendance records.' },
    { key: 'registrations', title: 'Find a prospect or new registration', terms: ['prospect', 'prospects', 'new registration', 'registrations', 'admission', 'enquiry', 'enquiry'], help: 'Open New registrations to find and review incoming registration records.' },
    { key: 'onboarding', title: 'Student onboarding and communication', terms: ['student login', 'parent login', 'create login', 'login details', 'reset password', 'student password', 'parent password', 'onboarding'], help: 'Open Student Onboarding & Communication for the available onboarding and communication workflows.' },
    { key: 'students', title: 'Find a student or subscription', terms: ['student details', 'subscription', 'subscriptions', 'class balance', 'remaining classes', 'student record'], help: 'Open Students & Subscriptions to find student records and subscription information.' },
    { key: 'parents', title: 'Find parent details', terms: ['parent details', 'parent record', 'family details'], help: 'Open Parents to find parent records.' },
    { key: 'payroll', title: 'View teacher payroll', terms: ['teacher salary', 'salary', 'payroll', 'teacher payment'], help: 'Open Payroll to review teacher payment calculations.' },
    { key: 'reports', title: 'View or export reports', terms: ['report', 'reports', 'export', 'excel', 'download report'], help: 'Open Reports & Export to access the available reporting and export tools.' },
    { key: 'questionbank', title: 'Open the Question Bank', terms: ['question bank', 'questions', 'question paper', 'papers', 'exam questions'], help: 'Open Question Bank to work with the question and paper library.' },
    { key: 'academics', title: 'Open My Learning', terms: ['my learning', 'attendance', 'classes', 'class schedule', 'subscription', 'learning'], help: 'Open My Learning to view your classes, attendance and subscription details.' },
    { key: 'fun', title: 'Open Fun Zone', terms: ['fun zone', 'games', 'daily challenges', 'brain teasers', 'knowledge arena'], help: 'Open Fun Zone to access Knowledge Arena games and challenges.' },
    { key: 'settings', title: 'Open Account Settings', terms: ['account settings', 'change password', 'password', 'profile settings'], help: 'Open Settings to manage your account and change your password.' },

    // Teacher portal help topics. These map to the real Teacher tab keys in index.html.
    { key: 'dashboard', title: 'View earnings or download my salary slip', terms: ['salary slip', 'payslip', 'pay slip', 'earnings', 'my salary', 'teacher salary', 'payment received', 'paid status', 'demo bonus'], help: 'On your Dashboard, find Earnings and unlock it with your password. It shows classes × your rate, demo bonuses, adjustments and paid status. The Salary Slip button appears once payment is marked paid.' },
    { key: 'dashboard', title: 'View my daily teaching dashboard', terms: ['dashboard', 'today classes', 'today s classes', 'student notes', 'low balance', 'renewal', 'demo classes'], help: 'Your Dashboard shows today’s classes, students needing renewal, low balances, students not seen recently, demo classes and student notes.' },
    { key: 'pendingactions', title: 'Review pending action items', terms: ['pending action', 'pending tasks', 'what should i do', 'tasks waiting', 'overdue', 'to do list', 'action items'], help: 'Pending Action Items collects work waiting for you: overdue classes, timings to correct, missing Class Frequency, demos to mark done, homework or papers to review, missing study plans, unread chats and availability.' },
    { key: 'starteacher', title: 'View Star Teacher points and badges', terms: ['star teacher', 'points', 'badges', 'trophy', 'leaderboard', 'levels', 'earn points'], help: 'Star Teacher is a monthly points game when enabled by the office. Open it to see your points, level, badges and activities that can earn points.' },
    { key: 'schedule', title: 'Manage my class schedule', terms: ['class schedule', 'weekly schedule', 'timetable', 'extra class', 'class time', 'reschedule', 'remove pending class', 'placeholder time'], help: 'Class Schedule shows your classes by day or month. You can set up a weekly schedule, add an extra class, mark a class done or remove a pending class. Replace placeholder times such as 00:00, 01:00 or 02:00 with the real time.' },
    { key: 'frequency', title: 'Update class frequency for a student', terms: ['class frequency setup', 'class frequency', 'classes per week', 'weekday classes', 'weekly classes', 'frequency setup'], help: 'Class Frequency Setup records how many classes each student has on each weekday, per subject. The office uses it for monthly fees and the class schedule.' },
    { key: 'myfrequency', title: 'View my students’ class frequency', terms: ['my students class frequency', 'class frequency report', 'student frequency'], help: 'My Students Class Frequency lets you review the class frequency records for your students.' },
    { key: 'students', title: 'Find a student and check class balance', terms: ['find a student', 'student details', 'student contact', 'class balance', 'classes remaining', 'subscription balance', 'new subscription', 'renewal student'], help: 'My Students lists contact details, subjects and class balances (subscribed, used, left and next expiry) for students enrolled in your subjects. Use its search box to find a student.' },
    { key: 'studyplans', title: 'Create or update a student study plan', terms: ['study plan', 'study plans', 'lesson plan', 'topics', 'topic list', 'textbook', 'extract topics', 'export study plan'], help: 'Study Plans lets you create a topic list per student and subject, update topic progress, export a plan as PDF, or add topics from a textbook linked from the shared library.' },
    { key: 'homework', title: 'Assign homework or review submissions', terms: ['homework', 'assign homework', 'homework submission', 'review homework', 'mark reviewed', 'marks', 'feedback', 'due date'], help: 'Homework lets you assign work with a title, subject, due date, optional study-plan topic and attachment. Review student submissions, give marks and feedback, then mark them reviewed.' },
    { key: 'questionbank', title: 'Use Question Bank and practice papers', terms: ['question bank', 'questions', 'question paper', 'practice paper', 'practice papers', 'past papers', 'mark paper', 'marking', 'review questions', 'approve questions'], help: 'Question Bank includes the Review Queue, Full Question Bank, Archived, Practice Papers and Past Papers. You can create and assign practice papers, then mark written answers and review submissions. Availability depends on your access.' },
    { key: 'research', title: 'Prepare lessons and share teaching resources', terms: ['research', 'lesson prep', 'lesson preparation', 'ai brief', 'chapter brief', 'resource library', 'worksheet', 'share resources', 'student insights', 'question research'], help: 'Research includes lesson preparation briefs, saved briefs, a resource library for notes, worksheets and links, student insights and question research. This tab appears only when Research access is enabled.' },
    { key: 'attendance', title: 'Give attendance for a class', terms: ['give attendance', 'mark attendance', 'record attendance', 'class attended', 'attendance entry', 'attendance marking'], help: 'Give Attendance records a class you taught. Records for the current month can be edited; earlier months are view-only.' },
    { key: 'report', title: 'View my attendance report', terms: ['my attendance report', 'attendance report', 'classes taught', 'monthly attendance', 'attendance by student'], help: 'My Attendance Report shows your classes for the month, grouped by student.' },
    { key: 'availability', title: 'Set my availability and leave dates', terms: ['availability', 'available hours', 'teaching hours', 'leave', 'leave dates', 'free slots', 'weekly availability'], help: 'Availability lets you set your weekly teaching hours and leave dates, and view a free-slots report.' },
    { key: 'knowledgearena', title: 'Play Knowledge Arena', terms: ['knowledge arena', 'games', 'daily challenge', 'quiz', 'game'], help: 'Knowledge Arena provides grade-appropriate games for Teachers. Selecting a temporary grade for player mode does not change your teacher record.' },
    { key: 'profile', title: 'View or update my teacher profile', terms: ['my profile', 'teacher profile', 'profile details', 'online class link'], help: 'My Profile shows your details and online class link.' },
    { key: 'appraisalframework', title: 'View my appraisal framework', terms: ['appraisal', 'appraisal framework', 'performance criteria'], help: 'My Appraisal Framework shows the appraisal framework available to you, when access has been enabled.' },
    { key: 'setup', title: 'Change my account password', terms: ['change password', 'reset password', 'account password', 'login password'], help: 'Open Setup in the Account group to change your password.' },
    { key: 'demoanalysis', title: 'Review my demo analysis', terms: ['demo analysis', 'demo classes', 'demo conversion', 'demo outcomes', 'assigned demos'], help: 'My Demo Analysis shows assigned demos, period totals, completed, converted, pending and lost outcomes, conversion rate and subject conversion.' },
    { key: 'classdelivery', title: 'Review class delivery performance', terms: ['class delivery', 'delivery intelligence', 'overdue classes', 'conducted classes', 'delivery rate', 'attendance rate', 'class trend'], help: 'Class Delivery Intelligence shows scheduled, conducted, absent, pending and overdue classes, delivery and attendance rates, a 14-day trend and teacher/student breakdowns.' },
    { key: 'teacherperformance', title: 'Review my teaching performance', terms: ['teacher performance', 'performance intelligence', 'workload', 'subject workload', 'six month trend', 'student engagement'], help: 'Teacher Performance Intelligence is a read-only view of your workload, students, subject workload, six-month delivery and attendance trends, student engagement and overdue classes.' },
    { key: 'chat', title: 'Chat with Admin or another user', terms: ['chat', 'message admin', 'send message', 'communication'], help: 'Use the Chat button in the top bar to message Admin and other users.', helpOnly: true },
    { key: 'support', title: 'Report an issue or request support', terms: ['support', 'report an issue', 'problem', 'bug', 'something wrong'], help: 'Use the Support button in the top bar if something looks wrong.', helpOnly: true }
  ];

  const QUICK_BY_ROLE = {
    Admin: ['Send a fee request', 'Find a prospect', 'Create a student login'],
    Student: ['Open My Learning', 'Open Fun Zone', 'Open Account Settings'],
    Teacher: ['View my classes', 'Mark attendance', 'Find a student'],
    Parent: []
  };

  function getRole() {
    try { if (typeof currentRole !== 'undefined' && currentRole) return String(currentRole); } catch (e) {}
    const topbar = document.querySelector('#app .topbar');
    const text = topbar ? (topbar.textContent || '') : '';
    const match = text.match(/\((Admin|Teacher|Student|Parent)\)/i);
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : '';
  }

  function tasksForRole() {
    const role = getRole();
    if (role === 'Student') return TASKS.filter(task => ['academics', 'fun', 'settings'].includes(task.key));
    if (role === 'Teacher') return TASKS.filter(task => ['dashboard','pendingactions','starteacher','schedule','frequency','myfrequency','students','studyplans','homework','questionbank','research','attendance','report','availability','knowledgearena','profile','appraisalframework','setup','demoanalysis','classdelivery','teacherperformance','chat','support'].includes(task.key));
    if (role === 'Parent') return [];
    return TASKS.filter(task => !['academics', 'fun', 'settings'].includes(task.key));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normal(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function isVisibleInCurrentPortal(node) {
    if (!node || node.hidden || node.getAttribute("aria-hidden") === "true") return false;
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    let current = node;
    while (current && current !== document.body) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle ? window.getComputedStyle(current) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      current = current.parentElement;
    }
    return true;
  }
  function getNavItems() {
    const role = getRole();
    let selector = '';
    if (role === 'Student') selector = '.student-portal-section-switcher [onclick*="setStudentPortalSection("]';
    else if (role === 'Teacher') selector = '#app [onclick]';
    else if (role === 'Parent') selector = '.parent-sidebar .sidebar-item[onclick], .parent-portal [onclick]';
    else selector = '.sidebar-nav .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick]';
    const nodes = Array.from(document.querySelectorAll(selector)).filter(isVisibleInCurrentPortal);
    const found = new Map();
    nodes.forEach(node => {
      const handler = node.getAttribute('onclick') || '';
      let match = handler.match(/setTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setTeacherPortalTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setStudentPortalSection\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/set[A-Za-z0-9_]*(?:Tab|Section)\(['"]([^'"]+)['"]\)/);
      if (!match) return;
      const key = match[1];
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (key && label && !found.has(key)) found.set(key, { key, label, handler });
    });
    return Array.from(found.values());
  }
  function navigate(key) {
    const items = getNavItems();
    const item = items.find(entry => entry.key === key);
    if (!item) return;
    const node = Array.from(document.querySelectorAll(
      '.sidebar-nav .sidebar-item[onclick], .teacher-sidebar .sidebar-item[onclick], .parent-sidebar .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick], [onclick*="setStudentPortalSection("]'
    )).find(el => (el.getAttribute('onclick') || '') === item.handler);
    if (node) { node.click(); return; }
    if (/setTab\(/.test(item.handler) && typeof window.setTab === 'function') window.setTab(key);
    else if (/setTeacherPortalTab\(/.test(item.handler) && typeof window.setTeacherPortalTab === 'function') window.setTeacherPortalTab(key);
    else if (/setStudentPortalSection\(/.test(item.handler) && typeof window.setStudentPortalSection === 'function') window.setStudentPortalSection(key);
  }
  function rank(query, item) {
    const q = normal(query);
    const title = normal(item.title);
    const label = normal(item.label || '');
    const terms = [title, label].concat(item.terms || []).map(normal);
    if (!q) return 0;
    let score = 0;
    terms.forEach(term => {
      if (!term) return;
      if (term === q) score = Math.max(score, 100);
      else if (term.includes(q)) score = Math.max(score, 80);
      else if (q.includes(term) && term.length > 3) score = Math.max(score, 65);
      const tokens = q.split(' ').filter(Boolean);
      const hits = tokens.filter(token => term.includes(token)).length;
      if (tokens.length && hits) score = Math.max(score, Math.round(45 * hits / tokens.length));
    });
    return score;
  }
  function renderResults(root, query) {
    const results = root.querySelector('[data-help-results]');
    if (!results) return;
    const nav = getNavItems();
    const q = normal(query);
    if (!q) {
      results.innerHTML = '<div class="lib-help-hint">Search menu options or describe what you want to do.</div>';
      return;
    }
    const candidates = [];
    nav.forEach(item => candidates.push({ key: item.key, title: item.label, label: 'Menu', help: 'Open this section of MY LIB.', terms: [] }));
    tasksForRole().forEach(task => {
      if (task.helpOnly) candidates.push({ ...task, label: 'Help' });
      else if (nav.some(item => item.key === task.key)) candidates.push({ ...task, label: 'How to', menuLabel: nav.find(item => item.key === task.key).label });
    });
    const ranked = candidates.map(item => ({ item, score: rank(q, item) }))
      .filter(entry => entry.score > 0)
      .sort((a,b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 6);
    if (!ranked.length) {
      results.innerHTML = '<div class="lib-help-empty">No matching menu or task found. Try a shorter term, such as “fees”, “attendance” or “student”.</div>';
      return;
    }
    results.innerHTML = ranked.map(({item}) => `
      <button type="button" class="lib-help-result" data-help-key="${esc(item.key)}">
        <span class="lib-help-result-main">
          <strong>${esc(item.title)}</strong>
          <small>${esc(item.help)}${item.menuLabel ? ' Destination: ' + esc(item.menuLabel) + '.' : ''}</small>
        </span>
        <span class="lib-help-result-type">${esc(item.label)}</span>
        <span class="lib-help-arrow" aria-hidden="true">→</span>
      </button>`).join('');
  }
  function refreshQuickActions(root) {
    const quick = root && root.querySelector("[data-help-quick]");
    if (!quick) return;
    const nav = getNavItems();
    const available = (QUICK_BY_ROLE[getRole()] || []).filter(query => getRole() === 'Teacher' || tasksForRole().some(task => nav.some(item => item.key === task.key) && rank(query, task) > 0));
    quick.innerHTML = available.map(query => '<button type="button" data-help-query="' + esc(query) + '">' + esc(query) + '</button>').join("");
    const input = root.querySelector("[data-help-input]");
    quick.hidden = !!(input && input.value.trim());
  }
  function mount() {
    const app = document.getElementById('app');
    const topbar = app && app.querySelector('.topbar');
    if (!topbar) return;
    let root = app.querySelector('#lib-help-search');
    if (root) return;
    root = document.createElement('section');
    root.id = 'lib-help-search';
    root.setAttribute('aria-label', 'MY LIB Help and Search');
    root.innerHTML = `
      <div class="lib-help-head"><div><strong>MY LIB Help &amp; Search</strong><span>Find a feature or learn how to do something</span></div></div>
      <div class="lib-help-input-wrap"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="What would you like to do? e.g. send a fee request" aria-label="Search MY LIB features and help" data-help-input><button type="button" data-help-clear aria-label="Clear search">×</button></div>
      <div class="lib-help-quick" data-help-quick></div>
      <div class="lib-help-results" data-help-results><div class="lib-help-hint">Search menu options or describe what you want to do.</div></div>`;
    topbar.insertAdjacentElement('afterend', root);
    refreshQuickActions(root);
    const input = root.querySelector('[data-help-input]');
    input.addEventListener('input', () => {
      root.querySelector('[data-help-quick]').hidden = !!input.value.trim();
      renderResults(root, input.value);
    });
    root.querySelector('[data-help-clear]').addEventListener('click', () => {
      input.value = ''; root.querySelector('[data-help-quick]').hidden = false;
      renderResults(root, ''); input.focus();
    });
    root.querySelector('[data-help-quick]').addEventListener('click', event => {
      const button = event.target.closest('[data-help-query]');
      if (!button) return;
      input.value = button.getAttribute('data-help-query');
      root.querySelector('[data-help-quick]').hidden = true;
      renderResults(root, input.value);
    });
    root.querySelector('[data-help-results]').addEventListener('click', event => {
      const button = event.target.closest('[data-help-key]');
      if (button) navigate(button.getAttribute('data-help-key'));
    });
  }
  function addStyles() {
    if (document.getElementById('lib-help-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'lib-help-search-styles';
    style.textContent = `
      #lib-help-search{margin:0 0 16px;padding:13px 16px 12px;background:var(--paper,#fbf9f3);border:1px solid var(--line,#ded5bd);border-radius:10px;box-shadow:var(--card-shadow,0 1px 2px rgba(0,0,0,.05));}
      .lib-help-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.lib-help-head strong{display:block;font-family:'Zilla Slab',serif;font-size:17px;color:var(--forest,#3c5e42)}.lib-help-head span{display:block;font-size:12px;color:var(--muted,#7c7461);margin-top:2px}
      
      .lib-help-input-wrap{display:flex;align-items:center;gap:9px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;padding:0 10px;min-height:43px}.lib-help-input-wrap>span{font-size:23px;color:var(--muted,#7c7461)}.lib-help-input-wrap input{flex:1;min-width:0;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important;color:var(--ink,#232a24)!important;font:14px 'Work Sans',sans-serif!important;padding:10px 0!important}.lib-help-input-wrap button{border:0;background:transparent;color:var(--muted,#7c7461);font-size:22px;cursor:pointer}
      .lib-help-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.lib-help-quick button{border:1px solid var(--line,#ded5bd);background:transparent;color:var(--forest,#3c5e42);border-radius:20px;padding:5px 9px;font:600 11px 'Work Sans',sans-serif;cursor:pointer}.lib-help-quick button:hover{background:#e7eee5}
      .lib-help-results{display:grid;gap:6px;margin-top:9px}.lib-help-hint,.lib-help-empty{font-size:12px;color:var(--muted,#7c7461);padding:4px 1px}.lib-help-result{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:10px 11px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;color:var(--ink,#232a24);cursor:pointer}.lib-help-result:hover{border-color:var(--forest,#3c5e42);background:#f8faf6}.lib-help-result-main{display:block;min-width:0;flex:1}.lib-help-result-main strong{display:block;font-size:13px}.lib-help-result-main small{display:block;font-size:11px;line-height:1.45;color:var(--muted,#7c7461);margin-top:3px}.lib-help-result-type{font-size:10px;font-weight:700;color:var(--forest,#3c5e42);white-space:nowrap}.lib-help-arrow{font-size:17px;color:var(--forest,#3c5e42)}
      @media(max-width:600px){#lib-help-search{padding:11px 10px}.lib-help-head strong{font-size:15px}.lib-help-result{align-items:flex-start}.lib-help-result-type{font-size:9px}}
    `;
    document.head.appendChild(style);
  }
  function start() {
    addStyles();
    mount();
    const app = document.getElementById('app');
    if (!app || window.__libHelpSearchObserver) return;
    window.__libHelpSearchObserver = new MutationObserver(records => {
      if (!app.querySelector('#lib-help-search')) { mount(); return; }
      const root = app.querySelector('#lib-help-search');
      const portalChanged = records.some(record => {
        const target = record.target && (record.target.nodeType === 1 ? record.target : record.target.parentElement);
        return target && !root.contains(target) && !(target.closest && target.closest('#lib-help-search'));
      });
      if (portalChanged) {
        refreshQuickActions(root);
        const input = root.querySelector('[data-help-input]');
        if (input && input.value.trim()) renderResults(root, input.value);
      }
    });
    window.__libHelpSearchObserver.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
