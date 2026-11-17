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
    { key: 'questionbank', title: 'Open the Question Bank', terms: ['question bank', 'questions', 'question paper', 'papers', 'exam questions'], help: 'Open Question Bank to work with the question and paper library.' }
  ];

  const QUICK = ['Send a fee request', 'Find a prospect', 'Mark attendance', 'Create a student login'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normal(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function getNavItems() {
    const nodes = Array.from(document.querySelectorAll(
      '.sidebar-nav .sidebar-item[onclick], .teacher-sidebar .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick]'
    ));
    const found = new Map();
    nodes.forEach(node => {
      const handler = node.getAttribute('onclick') || '';
      let match = handler.match(/setTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setTeacherPortalTab\(['"]([^'"]+)['"]\)/) ||
                  handler.match(/setStudentPortalSection\(['"]([^'"]+)['"]\)/);
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
      '.sidebar-nav .sidebar-item[onclick], .teacher-sidebar .sidebar-item[onclick], .mobile-tab-dropdown .mobile-tab-item[onclick]'
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
    TASKS.forEach(task => {
      if (nav.some(item => item.key === task.key)) candidates.push({ ...task, label: 'How to', menuLabel: nav.find(item => item.key === task.key).label });
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
      <div class="lib-help-head"><div><strong>MY LIB Help &amp; Search</strong><span>Find a feature or learn how to do something</span></div><span class="lib-help-free">No AI · No API cost</span></div>
      <div class="lib-help-input-wrap"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="What would you like to do? e.g. send a fee request" aria-label="Search MY LIB features and help" data-help-input><button type="button" data-help-clear aria-label="Clear search">×</button></div>
      <div class="lib-help-quick" data-help-quick>${QUICK.map(q => '<button type="button" data-help-query="' + esc(q) + '">' + esc(q) + '</button>').join('')}</div>
      <div class="lib-help-results" data-help-results><div class="lib-help-hint">Search menu options or describe what you want to do.</div></div>`;
    topbar.insertAdjacentElement('afterend', root);
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
      .lib-help-free{flex-shrink:0;padding:4px 8px;border-radius:20px;background:#e7eee5;color:#385c3f!important;font-size:10px!important;font-weight:700;white-space:nowrap}
      .lib-help-input-wrap{display:flex;align-items:center;gap:9px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;padding:0 10px;min-height:43px}.lib-help-input-wrap>span{font-size:23px;color:var(--muted,#7c7461)}.lib-help-input-wrap input{flex:1;min-width:0;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important;color:var(--ink,#232a24)!important;font:14px 'Work Sans',sans-serif!important;padding:10px 0!important}.lib-help-input-wrap button{border:0;background:transparent;color:var(--muted,#7c7461);font-size:22px;cursor:pointer}
      .lib-help-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.lib-help-quick button{border:1px solid var(--line,#ded5bd);background:transparent;color:var(--forest,#3c5e42);border-radius:20px;padding:5px 9px;font:600 11px 'Work Sans',sans-serif;cursor:pointer}.lib-help-quick button:hover{background:#e7eee5}
      .lib-help-results{display:grid;gap:6px;margin-top:9px}.lib-help-hint,.lib-help-empty{font-size:12px;color:var(--muted,#7c7461);padding:4px 1px}.lib-help-result{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:10px 11px;border:1px solid var(--line,#ded5bd);border-radius:8px;background:#fff;color:var(--ink,#232a24);cursor:pointer}.lib-help-result:hover{border-color:var(--forest,#3c5e42);background:#f8faf6}.lib-help-result-main{display:block;min-width:0;flex:1}.lib-help-result-main strong{display:block;font-size:13px}.lib-help-result-main small{display:block;font-size:11px;line-height:1.45;color:var(--muted,#7c7461);margin-top:3px}.lib-help-result-type{font-size:10px;font-weight:700;color:var(--forest,#3c5e42);white-space:nowrap}.lib-help-arrow{font-size:17px;color:var(--forest,#3c5e42)}
      @media(max-width:600px){#lib-help-search{padding:11px 10px}.lib-help-head strong{font-size:15px}.lib-help-free{font-size:9px!important}.lib-help-result{align-items:flex-start}.lib-help-result-type{font-size:9px}}
    `;
    document.head.appendChild(style);
  }
  function start() {
    addStyles();
    mount();
    const app = document.getElementById('app');
    if (!app || window.__libHelpSearchObserver) return;
    window.__libHelpSearchObserver = new MutationObserver(() => {
      if (!app.querySelector('#lib-help-search')) mount();
    });
    window.__libHelpSearchObserver.observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
