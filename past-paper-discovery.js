/* Admin UI for Online Past Paper Discovery. Loaded after the main app so it can reuse sb, render and existing master data. */
(function () {
  'use strict';
  if (window.__libPastPaperDiscoveryInstalled) return;
  window.__libPastPaperDiscoveryInstalled = true;

  var state = { loaded:false, loading:false, sources:[], candidates:[], rejectedCandidates:[], schools:[], runs:[], message:'', error:'', actionMessages:{}, searchBusy:false, scope:'board', queueTab:'review' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function byId(id) { return document.getElementById(id); }
  function val(id) { return byId(id) ? byId(id).value : ''; }
  function notify(message, isError) { state.message = message || ''; state.error = isError ? message : ''; if (typeof render === 'function') render(); }\n  function notifyAction(id, message, isError) { state.actionMessages[id] = { message:message || '', error:!!isError }; if (typeof render === 'function') render(); }
  function selectOptions(rows, selected, label) {
    return '<option value="">' + esc(label) + '</option>' + (rows || []).map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (String(r.id) === String(selected || '') ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('');
  }
  async function loadData(force) {
    if (state.loading || (state.loaded && !force)) return;
    if (typeof sb === 'undefined' || !sb || currentRole !== 'Admin') return;
    state.loading = true;
    try {
      var results = await Promise.all([
        sb.from('qb_paper_discovery_sources').select('*').order('priority').order('display_name'),
        sb.from('qb_paper_discovery_candidates').select('*').order('discovered_at', {ascending:false}).limit(100),
        sb.from('qb_paper_discovery_candidates').select('*').eq('status', 'rejected').order('reviewed_at', {ascending:false}).limit(100),
        sb.from('qb_schools').select('id,name,archived').eq('archived', false).order('name'),
        sb.from('qb_paper_discovery_runs').select('*').order('started_at', {ascending:false}).limit(8)
      ]);
      var failure = results.find(function (r) { return r.error; });
      if (failure) throw failure.error;
      state.sources = results[0].data || [];
      state.candidates = (results[1].data || []).filter(function (c) { return ['imported', 'rejected', 'duplicate'].indexOf(c.status) < 0; });
      state.rejectedCandidates = results[2].data || [];
      state.schools = results[3].data || [];
      state.runs = results[4].data || [];
      state.loaded = true;
      state.error = '';
    } catch (e) {
      state.error = 'Online Discovery database is not ready: ' + (e && e.message ? e.message : String(e));
      state.loaded = true;
    } finally {
      state.loading = false;
    }
  }
  function ensureLoaded() {
    if (!state.loaded && !state.loading) loadData(false).then(function () { if (typeof render === 'function') render(); });
  }
  async function invoke(body) {
    var result = await sb.functions.invoke('past-paper-discovery', { body: body });
    if (result.error) {
      var message = result.error.message || 'Discovery request failed.';
      try { if (result.error.context && result.error.context.json) { var detail = await result.error.context.json(); if (detail.error) message = detail.error; } } catch (_) {}
      throw new Error(message);
    }
    if (result.data && result.data.error) throw new Error(result.data.error);
    return result.data || {};
  }
  function sourceRowsHtml() {
    if (!state.sources.length) return '<p class="hint">No approved sources yet. Add an official board, school or trusted education domain below.</p>';
    return state.sources.map(function (s) {
      return '<div class="lib-ppd-source"><div><b>' + esc(s.display_name) + '</b><div class="hint">' + esc(s.domain) + ' · ' + esc(s.source_type) + ' · ' + esc(s.trust_level) + '</div></div>'
        + '<span class="hint">' + (s.enabled ? 'Enabled' : 'Disabled') + '</span>'
        + '<button class="btn-small" onclick="libPPDToggleSource(\'' + esc(s.id) + '\',' + (!s.enabled) + ')">' + (s.enabled ? 'Disable' : 'Enable') + '</button></div>';
    }).join('');
  }
  function candidateHtml(c) {
    var boardsList = typeof boards !== 'undefined' ? boards.filter(function (x) { return !x.archived; }) : [];
    var gradesList = typeof grades !== 'undefined' ? grades.filter(function (x) { return !x.archived; }) : [];
    var school = c.school_id ? state.schools.find(function (s) { return s.id === c.school_id; }) : null;
    var registeredSource = state.sources.find(function (s) { return s.id === c.source_id || c.source_domain === s.domain || c.source_domain.endsWith('.' + s.domain); });
    var domainAction = (!registeredSource || c.source_id !== registeredSource.id || !registeredSource.enabled)
      ? '<div class="lib-ppd-domain-approval">' + (!registeredSource ? '<select id="ppd-domaintype-' + esc(c.id) + '"><option value="school">School website</option><option value="education_portal">Education portal</option></select>' : '') + '<button class="btn-small" onclick="libPPDApproveDomain(' + "'" + esc(c.id) + "'" + ')">' + (registeredSource && !registeredSource.enabled ? 'Enable and link source domain' : 'Approve / link source domain') + '</button></div>'
      : '';
    var meta = c.discovery_metadata || {};
    var previewUrl = c.pdf_url || c.source_url;
    var isSchool = c.source_type === 'school';
    // Derive review defaults from the title and approved source; persist only on explicit import.
    var title = String(c.title || '');
    var sessionMatch = title.match(/\b(19\d{2}|20\d{2})\s*[-–/]\s*(\d{2}|20\d{2})\b/);
    var inferredYear = sessionMatch
      ? (sessionMatch[2].length === 2 ? Number(String(Math.floor(Number(sessionMatch[1]) / 100)) + sessionMatch[2]) : Number(sessionMatch[2]))
      : Number((title.match(/\b(19\d{2}|20\d{2})\b/) || [])[1]) || new Date().getFullYear();
    var subjectMatch = title.match(/[—–-]\s*([^—–-]+)\s*$/);
    var inferredSubject = subjectMatch ? subjectMatch[1].trim() : '';
    var classMatch = title.match(/\bClass\s+(XII|XI|X|[1-9]|1[0-2])\b/i);
    var classNumber = classMatch ? ({X:'10',XI:'11',XII:'12'}[classMatch[1].toUpperCase()] || classMatch[1]) : '';
    var inferredBoard = c.board_id || (boardsList.find(function (b) {
      return /cbse/i.test(String(b.name || '')) && (/cbse/i.test(String(meta.source_name || '')) || /cbseacademic\.nic\.in$/i.test(String(c.source_domain || '')));
    }) || {}).id || '';
    var inferredGrade = c.grade_id || (gradesList.find(function (g) { return String(g.name).trim() === classNumber; }) || {}).id || '';
    var inferredExam = c.exam_type || (/sample\s*(question\s*)?paper/i.test(title) ? 'sample' : 'main');
    var mediumOptions = ['English','Hindi','Kannada','Sanskrit','Other'];
    var inferredMedium = c.medium || (mediumOptions.find(function (m) { return inferredSubject.toLowerCase() === m.toLowerCase(); }) || 'English');
    var metadata = '<div class="lib-ppd-meta">'
      + (isSchool
        ? '<label>School<select id="ppd-school-' + esc(c.id) + '">' + selectOptions(state.schools, c.school_id, 'Select school') + '</select></label>'
          + '<label>New school name<input id="ppd-newschool-' + esc(c.id) + '" value="' + esc(c.discovered_school_name || '') + '" placeholder="Add if not listed"></label>'
          + '<button class="btn-small" type="button" onclick="libPPDAddSchool(\'' + esc(c.id) + '\')">Add to school directory</button>'
        : '<label>Board<select id="ppd-board-' + esc(c.id) + '">' + selectOptions(boardsList, inferredBoard, 'Select board') + '</select></label>')
      + '<label>Class<select id="ppd-grade-' + esc(c.id) + '">' + selectOptions(gradesList, inferredGrade, 'Select class') + '</select></label>'
      + '<label>Subject<input id="ppd-subject-' + esc(c.id) + '" value="' + esc(c.subject_name || inferredSubject) + '" placeholder="e.g. Sanskrit"></label>'
      + '<label>Year<input id="ppd-year-' + esc(c.id) + '" type="number" min="1950" max="' + (new Date().getFullYear()+1) + '" value="' + esc(c.year || inferredYear) + '"></label>'
      + '<label>Exam type<select id="ppd-exam-' + esc(c.id) + '"><option value="main"' + (inferredExam === 'main' ? ' selected' : '') + '>Main</option><option value="compartment"' + (inferredExam === 'compartment' ? ' selected' : '') + '>Compartment</option><option value="supplementary"' + (inferredExam === 'supplementary' ? ' selected' : '') + '>Supplementary</option><option value="sample"' + (inferredExam === 'sample' ? ' selected' : '') + '>Sample Question Paper</option><option value="other"' + (inferredExam === 'other' ? ' selected' : '') + '>Other</option></select></label>'
      + '<label>Medium<select id="ppd-medium-' + esc(c.id) + '">' + mediumOptions.map(function (m) { return '<option value="' + esc(m) + '"' + (inferredMedium === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></label>'
      + '</div>';
    var actions = '<div class="lib-ppd-actions"><a class="btn-small" href="' + esc(previewUrl) + '" target="_blank" rel="noopener noreferrer">Open source / PDF</a>'
      + '<button class="btn-small" onclick="libPPDVerify(\'' + esc(c.id) + '\')" ' + (['verified','duplicate'].indexOf(c.verification_status) >= 0 ? 'disabled' : '') + '>Verify PDF</button>'
      + (c.verification_status === 'verified' && c.status !== 'imported' && c.status !== 'rejected' && c.status !== 'duplicate'
        ? '<button class="btn-small btn-primary" onclick="libPPDImport(\'' + esc(c.id) + '\')">Import to Past Papers</button>'
        : '')
      + (c.status !== 'rejected' && c.status !== 'imported' ? '<button class="btn-small" onclick="libPPDReject(\'' + esc(c.id) + '\')">Reject</button>' : '')
      + '</div>';
    var actionMessage = state.actionMessages[c.id];
    var actionStatus = actionMessage && actionMessage.message
      ? '<div class="lib-ppd-action-status hint" role="status" aria-live="polite" style="color:' + (actionMessage.error ? 'var(--brick)' : 'var(--forest)') + ';margin:6px 0 0">' + esc(actionMessage.message) + '</div>'
      : '';
    return '<article class="lib-ppd-candidate"><div class="lib-ppd-review-layout"><div class="lib-ppd-review-summary"><div class="lib-ppd-candidate-head"><div><b>' + esc(c.title) + '</b><div class="hint">' + esc(c.source_domain) + ' · ' + esc(c.source_type) + ' · ' + esc(c.status) + ' · PDF: ' + esc(c.verification_status) + '</div>'
      + (meta.snippet ? '<p class="hint">' + esc(meta.snippet) + '</p>' : '')
      + (school ? '<div class="hint">School: ' + esc(school.name) + '</div>' : (c.discovered_school_name ? '<div class="hint">Possible school: ' + esc(c.discovered_school_name) + '</div>' : ''))
      + '</div></div>' + actions + actionStatus + domainAction + '</div><div class="lib-ppd-review-fields">' + metadata + '</div></div></article>';
  }
  function rejectedCandidateHtml(c) {
    var previewUrl = c.pdf_url || c.source_url;
    var rejectedAt = c.reviewed_at || c.updated_at || c.discovered_at;
    return '<article class="lib-ppd-candidate lib-ppd-rejected"><div class="lib-ppd-candidate-head"><div><b>' + esc(c.title) + '</b><div class="hint">' + esc(c.source_domain) + ' · ' + esc(c.source_type) + ' · Rejected ' + (rejectedAt ? esc(new Date(rejectedAt).toLocaleString()) : '') + ' · PDF: ' + esc(c.verification_status || 'not checked') + '</div>'
      + (c.rejection_reason ? '<p class="hint">Reason: ' + esc(c.rejection_reason) + '</p>' : '<p class="hint">No rejection reason was recorded.</p>')
      + (c.discovered_school_name ? '<div class="hint">School: ' + esc(c.discovered_school_name) + '</div>' : '')
      + '</div></div><div class="lib-ppd-actions">' + (previewUrl ? '<a class="btn-small" href="' + esc(previewUrl) + '" target="_blank" rel="noopener noreferrer">Open source / PDF</a>' : '')
      + '<button class="btn-small btn-primary" type="button" onclick="libPPDRestore(\'' + esc(c.id) + '\')">Restore to Needs Review</button></div></article>';
  }
  function renderQueueTabs() {
    var isRejected = state.queueTab === 'rejected';
    var items = isRejected ? state.rejectedCandidates : state.candidates;
    var content = isRejected
      ? (items.length ? items.map(rejectedCandidateHtml).join('') : '<div class="empty">No rejected papers found. Rejected candidates will appear here for recovery.</div>')
      : (items.length ? items.map(candidateHtml).join('') : '<div class="empty">No candidates awaiting review. Search approved websites to begin.</div>');
    return '<div class="lib-ppd-queue-tabs" role="tablist" aria-label="Past paper discovery queues">'
      + '<button type="button" role="tab" aria-selected="' + (!isRejected) + '" class="lib-ppd-queue-tab ' + (!isRejected ? 'active' : '') + '" onclick="libPPDSetQueueTab(\'review\')">Discovered papers (' + state.candidates.length + ')</button>'
      + '<button type="button" role="tab" aria-selected="' + isRejected + '" class="lib-ppd-queue-tab ' + (isRejected ? 'active' : '') + '" onclick="libPPDSetQueueTab(\'rejected\')">Rejected papers (' + state.rejectedCandidates.length + ')</button></div>'
      + '<div class="lib-ppd-section"><div class="lib-ppd-title"><h3>' + (isRejected ? 'Rejected papers · Recovery' : 'Discovered papers · Review queue') + '</h3><button class="btn-small" type="button" onclick="libPPDRefresh()">Refresh</button></div>' + content + '</div>';
  }
  function renderPanel() {
    ensureLoaded();
    if (state.loading && !state.loaded) return '<section class="lib-ppd"><h3>Discover papers online</h3><p class="hint">Loading discovery sources and review queue…</p></section>';
    var sources = '<details class="lib-ppd-section lib-ppd-approved-sources"><summary>Approved sources</summary><p class="hint">Searches cover the wider web. The registry highlights official boards and trusted education portals; newly discovered domains require Admin approval before PDF verification.</p>' + sourceRowsHtml()
      + '<div class="lib-ppd-source-form"><input id="ppd-source-name" placeholder="Source name (e.g. Delhi Public School)"><input id="ppd-source-domain" placeholder="Domain only (e.g. dps.example.edu)"><select id="ppd-source-type"><option value="board">Board</option><option value="school">School</option><option value="education_portal">Education portal</option></select><select id="ppd-source-trust"><option value="official">Official</option><option value="trusted">Trusted</option><option value="review">Review</option></select><button class="btn-small btn-primary" onclick="libPPDAddSource()">Add source</button></div></details>';
    var search = (state.error ? '<div class="hint" style="color:var(--brick);margin:8px 0">' + esc(state.error) + '</div>' : '') + '<div class="lib-ppd-section"><h3>Find question papers online</h3><div class="lib-ppd-search">'
      + '<select id="ppd-scope" onchange="libPPDSetScope(this.value)"><option value="board"' + (state.scope === 'board' ? ' selected' : '') + '>Board papers</option><option value="school"' + (state.scope === 'school' ? ' selected' : '') + '>Individual school papers</option></select>'
      + '<input id="ppd-query" placeholder="e.g. CBSE Class 10 Sanskrit question paper 2025" value="' + esc(state.lastQuery || '') + '">'
      + '<input id="ppd-school-name" placeholder="School name (optional)" value="' + esc(state.lastSchool || '') + '">'
      + '<button class="btn-small btn-primary" onclick="libPPDSearch()" ' + (state.searchBusy ? 'disabled' : '') + '>' + (state.searchBusy ? 'Searching…' : ('Search the web')) + '</button></div>'
      + '<p class="hint">Search results are candidates only. No paper enters the Question Bank until you verify its PDF and explicitly import it.</p>'
      + (state.message ? '<div class="hint" style="color:' + (state.error ? 'var(--brick)' : 'var(--forest)') + ';margin:8px 0">' + esc(state.message) + '</div>' : '') + '</div>';
    var candidates = renderQueueTabs();
    var runs = '<div class="lib-ppd-section"><h3>Recent searches</h3>' + (state.runs.length ? state.runs.map(function (r) {
      var progress = r.filters && r.filters.discovery_progress ? r.filters.discovery_progress : {};
      var progressText = r.status === 'running' ? ' · ' + Number(progress.next_offset || 0) + ' sources processed' : '';
      var resume = (r.status === 'running' || r.status === 'failed') ? ' <button class="btn-small" onclick="libPPDResumeRun(&#39;' + esc(r.id) + '&#39;)">Resume</button>' : '';
      var restart = r.status === 'completed' ? ' <button class="btn-small" onclick="libPPDRestartRun(&#39;' + esc(r.id) + '&#39;)">Run again from beginning</button>' : '';
      return '<div class="hint">' + esc(new Date(r.started_at).toLocaleString()) + ' · ' + esc(r.query_text) + ' · ' + esc(r.status) + ' · ' + esc(r.results_found) + ' results' + esc(progressText) + resume + restart + '</div>';
    }).join('') : '<p class="hint">No searches yet.</p>') + '</div>';
    return '<section class="lib-ppd"><style>'
      + '.lib-ppd{border-top:1px solid var(--line);margin-top:14px;padding-top:14px}.lib-ppd-queue-tabs{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin:14px 0 10px}.lib-ppd-queue-tab{border:1px solid var(--line);border-bottom:0;border-radius:8px 8px 0 0;background:var(--surface);color:var(--ink);padding:9px 13px;cursor:pointer;font:inherit}.lib-ppd-queue-tab.active{background:var(--surface-2,var(--surface));font-weight:700;border-color:var(--accent,var(--line))}.lib-ppd-rejected{border-left:3px solid var(--brick,var(--line))}.lib-ppd h3{font-family:Zilla Slab,serif;margin:0 0 7px}.lib-ppd-section{margin:14px 0 20px}.lib-ppd-approved-sources{border:1px solid var(--line);border-radius:9px;padding:10px 12px}.lib-ppd-approved-sources>summary{cursor:pointer;font-weight:700;list-style:disclosure-closed}.lib-ppd-approved-sources[open]>summary{margin-bottom:10px;list-style:disclosure-open}.lib-ppd-search,.lib-ppd-source-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.lib-ppd-search input{flex:1;min-width:190px}.lib-ppd-search select,.lib-ppd-search input,.lib-ppd-source-form input,.lib-ppd-source-form select,.lib-ppd-meta input,.lib-ppd-meta select{min-height:38px;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);box-sizing:border-box}.lib-ppd-source-form input{flex:1;min-width:170px}.lib-ppd-source{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)}.lib-ppd-candidate{border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}.lib-ppd-review-layout{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:16px;align-items:start}.lib-ppd-review-summary,.lib-ppd-review-fields{min-width:0}.lib-ppd-review-fields{border-left:1px solid var(--line);padding-left:16px}.lib-ppd-candidate-head,.lib-ppd-title,.lib-ppd-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}.lib-ppd-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:0}.lib-ppd-meta label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--muted);font-weight:700}.lib-ppd-meta input,.lib-ppd-meta select{width:100%}.lib-ppd-actions{justify-content:flex-start;margin-top:10px}.lib-ppd-domain-approval{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.lib-ppd-domain-approval select{min-height:34px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}.lib-ppd p.hint{margin:5px 0 10px}@media(max-width:700px){.lib-ppd-review-layout{grid-template-columns:minmax(0,1fr)}.lib-ppd-review-fields{border-left:0;border-top:1px solid var(--line);padding:12px 0 0}.lib-ppd-search,.lib-ppd-source-form{align-items:stretch}.lib-ppd-search>* ,.lib-ppd-source-form>*{width:100%;min-width:0}.lib-ppd-candidate-head{align-items:flex-start}}'
      + '</style>' + search + sources + candidates + runs + '</section>';
  }

  window.libPPDSetScope = function (v) { state.scope = v === 'school' ? 'school' : 'board'; };
  window.libPPDSetQueueTab = function (v) { state.queueTab = v === 'rejected' ? 'rejected' : 'review'; if (typeof render === 'function') render(); };
  window.libPPDRestore = async function (id) {
    var candidate = state.rejectedCandidates.find(function (c) { return c.id === id; });
    if (!candidate) { notify('This rejected paper is no longer in the recovery queue. Refresh and try again.', true); return; }
    if (!window.confirm('Restore this paper to Needs Review? It will reappear in Discovered papers. The PDF will not be uploaded again.')) return;
    var result = await sb.from('qb_paper_discovery_candidates').update({ status:'needs_review', rejection_reason:null, reviewed_by:null, reviewed_at:null, updated_at:new Date().toISOString() }).eq('id', id).eq('status', 'rejected').select('id').maybeSingle();
    if (result.error) { notify('Could not restore paper: ' + result.error.message, true); return; }
    if (!result.data) { notify('Paper was not restored because its status changed. Refresh and check the queue.', true); return; }
    state.queueTab = 'review'; state.loaded = false; await loadData(true); notify('Paper restored to Needs Review.');
  };
  window.libPPDRefresh = async function () { state.loaded = false; await loadData(true); if (typeof render === 'function') render(); };
  window.libPPDSearch = async function () {
    if (state.searchBusy) return;
    var query = val('ppd-query').trim();
    var scope = val('ppd-scope') || state.scope;
    if (query.length < 2) { notify('Enter at least two characters to search.', true); return; }
    state.scope = scope; state.lastQuery = query; state.lastSchool = val('ppd-school-name');
    state.searchBusy = true; state.message = 'Searching the wider web…'; state.error = ''; if (typeof render === 'function') render();
    try {
      var result = await invoke({ action:'search', query:query, scope:scope, school_name:state.lastSchool });
      var calls = 0;
      while (!result.complete && result.run_id && calls < 200) {
        state.message = 'Searching source ' + result.sources_processed + ' of ' + result.sources_total
          + (result.next_source ? ' · Next: ' + result.next_source : '') + ' · ' + result.found + ' candidates found so far…';
        if (typeof render === 'function') render();
        result = await invoke({ action:'continue_search', run_id:result.run_id });
        calls++;
      }
      if (!result.complete) throw new Error('Discovery is still in progress. Refresh the page and check Recent searches before starting another run.');
      state.message = 'Search complete (' + (result.provider || 'web search') + '): checked ' + result.sources_processed + ' of ' + result.sources_total + ' registered sources; ' + (result.provider_successful_queries || 0) + ' provider queries succeeded; ' + result.found + ' results found; ' + result.new_candidates + ' new candidates saved. Approved-source matches: ' + (result.approved_source_results || 0) + '.' + (result.provider_errors && result.provider_errors.length ? ' Provider warnings: ' + result.provider_errors.slice(0, 3).join(' | ') : '') + ' Unregistered domains need Admin approval before PDF verification.';
      state.loaded = false; await loadData(true);
    } catch (e) { state.message = e.message || String(e); state.error = state.message; }
    finally { state.searchBusy = false; if (typeof render === 'function') render(); }
  };
  window.libPPDResumeRun = async function (runId) {
    if (state.searchBusy) return;
    state.searchBusy = true; state.error = ''; state.message = 'Resuming saved discovery run…';
    if (typeof render === 'function') render();
    try {
      var result = { run_id:runId, complete:false }, calls = 0;
      while (!result.complete && calls < 200) {
        result = await invoke({ action:'continue_search', run_id:runId });
        state.message = result.complete
          ? 'Search complete: checked ' + result.sources_processed + ' of ' + result.sources_total + ' registered sources; ' + (result.provider_successful_queries || 0) + ' provider queries succeeded; ' + result.found + ' results found; ' + result.new_candidates + ' new candidates saved.'
          : 'Resuming source ' + result.sources_processed + ' of ' + result.sources_total
            + (result.next_source ? ' · Next: ' + result.next_source : '') + '…';
        if (typeof render === 'function') render();
        calls++;
      }
      if (!result.complete) throw new Error('The run remains in progress. You can resume it again from Recent searches.');
      if (result.provider_errors && result.provider_errors.length) state.message += ' Provider warnings: ' + result.provider_errors.slice(0, 3).join(' | ');
      state.loaded = false; await loadData(true);
    } catch (e) { state.message = e.message || String(e); state.error = state.message; state.loaded = false; await loadData(true); }
    finally { state.searchBusy = false; if (typeof render === 'function') render(); }
  };
  window.libPPDRestartRun = async function (runId) {
    if (state.searchBusy) return;
    if (!window.confirm('Restart this discovery from the first registered source? Existing candidates will be kept; duplicate URLs will not be added again.')) return;
    state.searchBusy = true; state.error = ''; state.message = 'Restarting discovery from the beginning…';
    if (typeof render === 'function') render();
    try {
      var result = await invoke({ action:'restart_search', run_id:runId }), calls = 0;
      while (!result.complete && result.run_id && calls < 200) {
        state.message = 'Restarted · source ' + result.sources_processed + ' of ' + result.sources_total
          + (result.next_source ? ' · Next: ' + result.next_source : '') + '…';
        if (typeof render === 'function') render();
        result = await invoke({ action:'continue_search', run_id:runId });
        calls++;
      }
      if (!result.complete) throw new Error('The restarted run remains in progress. Resume it from Recent searches.');
      state.message = 'Restart complete: ' + result.found + ' results found; ' + result.new_candidates + ' additional candidates saved.';
      if (result.provider_errors && result.provider_errors.length) state.message += ' Provider warnings: ' + result.provider_errors.slice(0, 3).join(' | ');
      state.loaded = false; await loadData(true);
    } catch (e) { state.message = e.message || String(e); state.error = state.message; state.loaded = false; await loadData(true); }
    finally { state.searchBusy = false; if (typeof render === 'function') render(); }
  };
  window.libPPDAddSource = async function () {
    var name = val('ppd-source-name').trim(), domain = val('ppd-source-domain').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'').split('/')[0];
    var type = val('ppd-source-type'), trust = val('ppd-source-trust');
    if (name.length < 2 || !/^(?=.{3,253}$)[a-z0-9.-]+$/.test(domain) || domain.indexOf('..') >= 0) { notify('Enter a source name and a valid domain only (without a path).', true); return; }
    var { error } = await sb.from('qb_paper_discovery_sources').insert({ display_name:name, domain:domain, source_type:type, trust_level:trust, priority:100, enabled:true });
    if (error) { notify('Could not add source: ' + error.message, true); return; }
    state.loaded = false; await loadData(true); notify('Source added. It is now available for discovery searches.');
  };
  window.libPPDApproveDomain = async function (id) {
    var candidate = state.candidates.find(function (c) { return c.id === id; });
    if (!candidate) return;
    var domain = String(candidate.source_domain || '').toLowerCase().trim();
    var sourceType = val('ppd-domaintype-' + id) === 'education_portal' ? 'education_portal' : 'school';
    if (!/^(?=.{3,253}$)[a-z0-9.-]+$/.test(domain) || domain.indexOf('..') >= 0) { notify('This candidate has an invalid source domain.', true); return; }
    var source = state.sources.find(function (s) { return domain === s.domain || domain.endsWith('.' + s.domain); });
    if (!source) {
      var created = await sb.from('qb_paper_discovery_sources').insert({
        display_name:domain, domain:domain, source_type:sourceType, trust_level:'review', priority:100, enabled:true
      }).select('*').single();
      if (created.error) { notify('Could not approve source domain: ' + created.error.message, true); return; }
      source = created.data;
    } else if (!source.enabled) {
      var enabled = await sb.from('qb_paper_discovery_sources').update({ enabled:true, updated_at:new Date().toISOString() }).eq('id', source.id).select('*').single();
      if (enabled.error) { notify('Could not enable source domain: ' + enabled.error.message, true); return; }
      source = enabled.data;
    }
    var linked = await sb.from('qb_paper_discovery_candidates').update({ source_id:source.id, source_domain:source.domain, updated_at:new Date().toISOString() }).eq('id', id);
    if (linked.error) { notify('Domain approved but candidate linking failed: ' + linked.error.message, true); return; }
    state.loaded = false; await loadData(true); notify('Domain approved. You can now verify PDFs from this website.');
  };
  window.libPPDToggleSource = async function (id, enabled) {
    var { error } = await sb.from('qb_paper_discovery_sources').update({ enabled:enabled, updated_at:new Date().toISOString() }).eq('id', id);
    if (error) { notify('Could not update source: ' + error.message, true); return; }
    state.loaded = false; await loadData(true); if (typeof render === 'function') render();
  };
  window.libPPDAddSchool = async function (id) {
    var name = val('ppd-newschool-' + id).trim().replace(/\s+/g,' ');
    if (name.length < 2) { notify('Enter the school name first.', true); return; }
    var existing = state.schools.find(function (s) { return s.name.trim().toLowerCase() === name.toLowerCase(); });
    var school = existing;
    if (!school) {
      var result = await sb.from('qb_schools').insert({ name:name }).select('id,name,archived').single();
      if (result.error) { notify('Could not add school: ' + result.error.message, true); return; }
      school = result.data;
    }
    var { error } = await sb.from('qb_paper_discovery_candidates').update({ school_id:school.id, board_id:null, discovered_school_name:school.name, updated_at:new Date().toISOString() }).eq('id', id);
    if (error) { notify('School was added but candidate could not be linked: ' + error.message, true); return; }
    state.loaded = false; await loadData(true); notify('School linked to the existing school directory.');
  };
  window.libPPDVerify = async function (id) {
    notifyAction(id, 'Checking the source page and validating its PDF…');
    try {
      var result = await invoke({ action:'verify', candidate_id:id });
      notifyAction(id, result.duplicate ? 'This PDF is already in Past Papers; it has been marked as a duplicate.' : 'PDF verified (' + Math.round(result.file_size_bytes/1024) + ' KB). Review the metadata, then import when ready.');
      state.loaded = false; await loadData(true);
    } catch (e) { notifyAction(id, e.message || String(e), true); state.loaded = false; await loadData(true); }
    if (typeof render === 'function') render();
  };
  window.libPPDReject = async function (id) {
    var candidate = state.candidates.find(function (c) { return c.id === id; });
    if (!candidate) { notify('This discovered paper is no longer in the review queue. Refresh and try again.', true); return; }
    if (!window.confirm('Reject “' + String(candidate.title || 'this paper') + '”?\n\nWarning: it will disappear from Discovered papers and will not be imported. You can recover it later from the Rejected papers tab.')) return;
    var result = await sb.from('qb_paper_discovery_candidates').update({ status:'rejected', reviewed_by:currentUserId, reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', id).select('id').maybeSingle();
    if (result.error) { notify('Could not reject candidate: ' + result.error.message, true); return; }
    if (!result.data) { notify('Candidate was not rejected. Refresh and try again.', true); return; }
    state.loaded = false; await loadData(true); notify('Candidate rejected. It can be recovered from the Rejected papers tab.');
  };
  window.libPPDImport = async function (id) {
    var candidate = state.candidates.find(function (c) { return c.id === id; });
    if (!candidate) { notifyAction(id, 'This discovered paper is no longer in the review queue. Refresh and try again.', true); return; }
    var schoolId = candidate.source_type === 'school' ? val('ppd-school-' + id) : '';
    var boardId = candidate.source_type === 'school' ? '' : val('ppd-board-' + id);
    var gradeId = val('ppd-grade-' + id), subject = val('ppd-subject-' + id).trim();
    var year = Number(val('ppd-year-' + id)), exam = val('ppd-exam-' + id), medium = val('ppd-medium-' + id).trim();
    if ((!schoolId && !boardId) || !gradeId || !subject || !Number.isInteger(year) || !medium) {
      notifyAction(id, 'Complete Board / School, Class, Subject, Year and Medium before importing.', true); return;
    }
    if (candidate.verification_status !== 'verified') {
      notifyAction(id, 'Verify this PDF successfully before importing.', true); return;
    }
    notifyAction(id, 'Preparing the verified PDF for import…');
    try {
      // Save the explicit Admin review decision first. Selecting the row also
      // detects RLS/no-row cases that an UPDATE without SELECT can hide.
      var approval = await sb.from('qb_paper_discovery_candidates').update({
        status:'approved_for_import', board_id:boardId || null, school_id:schoolId || null, grade_id:gradeId,
        subject_name:subject, year:year, exam_type:exam, medium:medium, reviewed_by:currentUserId,
        reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString()
      }).eq('id', id).select('id').maybeSingle();
      if (approval.error) throw new Error('Could not save review metadata: ' + approval.error.message);
      if (!approval.data) throw new Error('Review metadata was not saved. Check Admin access and refresh the candidate.');
      notifyAction(id, 'Importing verified PDF into the existing Past Papers review queue…');
      var result = await invoke({ action:'import', candidate_id:id, board_id:boardId, school_id:schoolId,
        grade_id:gradeId, subject_name:subject, year:year, exam_type:exam, medium:medium });
      notifyAction(id, result.message || 'Imported into Past Papers.');
      state.loaded = false;
      await loadData(true);
      if (typeof loadQbSourcePapers === 'function') await loadQbSourcePapers();
    } catch (e) {
      notifyAction(id, 'Import failed: ' + (e && e.message ? e.message : String(e)), true);
      state.loaded = false;
      await loadData(true);
    }
    if (typeof render === 'function') render();
  };

  var original = window.renderAdminQuestionBank;
  if (typeof original === 'function') {
    window.renderAdminQuestionBank = function () {
      var html = original.apply(this, arguments);
      if (currentRole === 'Admin' && typeof qbSubTab !== 'undefined' && qbSubTab === 'past') {
        var panel = renderPanel();
        var marker = 'Online discovery engine · Planned next phase';
        var replacement = 'Online discovery engine · Admin search and review';
        html = html.replace(marker, replacement);

        // Match the label independently of its inline style and exact wrapper
        // attributes. The previous exact-style regex changed the heading but
        // could leave the discovery controls out of the rendered page.
        var markerNode = /(<(?:div|p|span)[^>]*>\s*Online discovery engine · Admin search and review\s*<\/(?:div|p|span)>)/i;
        if (markerNode.test(html)) {
          html = html.replace(markerNode, '$1' + panel);
        } else if (html.indexOf(replacement) >= 0) {
          // Fail visibly and safely if the host markup changes again.
          html += panel;
        }
      }
      return html;
    };
  }
  if (typeof currentRole !== 'undefined' && currentRole === 'Admin' && typeof qbSubTab !== 'undefined' && qbSubTab === 'past') ensureLoaded();
})();
