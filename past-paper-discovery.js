/* Admin UI for Online Past Paper Discovery. Loaded after the main app so it can reuse sb, render and existing master data. */
(function () {
  'use strict';
  if (window.__libPastPaperDiscoveryInstalled) return;
  window.__libPastPaperDiscoveryInstalled = true;

  var state = { loaded:false, loading:false, sources:[], candidates:[], schools:[], runs:[], message:'', error:'', searchBusy:false, scope:'board' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function byId(id) { return document.getElementById(id); }
  function val(id) { return byId(id) ? byId(id).value : ''; }
  function notify(message, isError) { state.message = message || ''; state.error = isError ? message : ''; if (typeof render === 'function') render(); }
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
        sb.from('qb_paper_discovery_candidates').select('*').order('discovered_at', {ascending:false}).limit(60),
        sb.from('qb_schools').select('id,name,archived').eq('archived', false).order('name'),
        sb.from('qb_paper_discovery_runs').select('*').order('started_at', {ascending:false}).limit(8)
      ]);
      var failure = results.find(function (r) { return r.error; });
      if (failure) throw failure.error;
      state.sources = results[0].data || [];
      state.candidates = results[1].data || [];
      state.schools = results[2].data || [];
      state.runs = results[3].data || [];
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
    var metadata = '<div class="lib-ppd-meta">'
      + (isSchool
        ? '<label>School<select id="ppd-school-' + esc(c.id) + '">' + selectOptions(state.schools, c.school_id, 'Select school') + '</select></label>'
          + '<label>New school name<input id="ppd-newschool-' + esc(c.id) + '" value="' + esc(c.discovered_school_name || '') + '" placeholder="Add if not listed"></label>'
          + '<button class="btn-small" type="button" onclick="libPPDAddSchool(\'' + esc(c.id) + '\')">Add to school directory</button>'
        : '<label>Board<select id="ppd-board-' + esc(c.id) + '">' + selectOptions(boardsList, c.board_id, 'Select board') + '</select></label>')
      + '<label>Class<select id="ppd-grade-' + esc(c.id) + '">' + selectOptions(gradesList, c.grade_id, 'Select class') + '</select></label>'
      + '<label>Subject<input id="ppd-subject-' + esc(c.id) + '" value="' + esc(c.subject_name || '') + '" placeholder="e.g. Sanskrit"></label>'
      + '<label>Year<input id="ppd-year-' + esc(c.id) + '" type="number" min="1950" max="' + (new Date().getFullYear()+1) + '" value="' + esc(c.year || new Date().getFullYear()) + '"></label>'
      + '<label>Exam type<select id="ppd-exam-' + esc(c.id) + '"><option value="main"' + (c.exam_type === 'main' || !c.exam_type ? ' selected' : '') + '>Main</option><option value="compartment"' + (c.exam_type === 'compartment' ? ' selected' : '') + '>Compartment</option><option value="supplementary"' + (c.exam_type === 'supplementary' ? ' selected' : '') + '>Supplementary</option><option value="sample"' + (c.exam_type === 'sample' ? ' selected' : '') + '>Sample Question Paper</option><option value="other"' + (c.exam_type === 'other' ? ' selected' : '') + '>Other</option></select></label>'
      + '<label>Medium<select id="ppd-medium-' + esc(c.id) + '"><option value="English"' + (!c.medium || c.medium === 'English' ? ' selected' : '') + '>English</option><option value="Hindi"' + (c.medium === 'Hindi' ? ' selected' : '') + '>Hindi</option><option value="Kannada"' + (c.medium === 'Kannada' ? ' selected' : '') + '>Kannada</option><option value="Sanskrit"' + (c.medium === 'Sanskrit' ? ' selected' : '') + '>Sanskrit</option><option value="Other"' + (c.medium === 'Other' ? ' selected' : '') + '>Other</option></select></label>'
      + '</div>';
    var actions = '<div class="lib-ppd-actions"><a class="btn-small" href="' + esc(previewUrl) + '" target="_blank" rel="noopener noreferrer">Open source / PDF</a>'
      + '<button class="btn-small" onclick="libPPDVerify(\'' + esc(c.id) + '\')" ' + (['verified','duplicate'].indexOf(c.verification_status) >= 0 ? 'disabled' : '') + '>Verify PDF</button>'
      + (c.verification_status === 'verified' && c.status !== 'imported' && c.status !== 'rejected' && c.status !== 'duplicate'
        ? '<button class="btn-small btn-primary" onclick="libPPDImport(\'' + esc(c.id) + '\')">Import to Past Papers</button>'
        : '')
      + (c.status !== 'rejected' && c.status !== 'imported' ? '<button class="btn-small" onclick="libPPDReject(\'' + esc(c.id) + '\')">Reject</button>' : '')
      + '</div>';
    return '<article class="lib-ppd-candidate"><div class="lib-ppd-candidate-head"><div><b>' + esc(c.title) + '</b><div class="hint">' + esc(c.source_domain) + ' · ' + esc(c.source_type) + ' · ' + esc(c.status) + ' · PDF: ' + esc(c.verification_status) + '</div>'
      + (meta.snippet ? '<p class="hint">' + esc(meta.snippet) + '</p>' : '')
      + (school ? '<div class="hint">School: ' + esc(school.name) + '</div>' : (c.discovered_school_name ? '<div class="hint">Possible school: ' + esc(c.discovered_school_name) + '</div>' : ''))
      + '</div>' + actions + '</div>' + domainAction + metadata + '</article>';
  }
  function renderPanel() {
    ensureLoaded();
    if (state.loading && !state.loaded) return '<section class="lib-ppd"><h3>Discover papers online</h3><p class="hint">Loading discovery sources and review queue…</p></section>';
    var sources = '<div class="lib-ppd-section"><h3>Approved sources</h3><p class="hint">Searches cover the wider web. The registry highlights official boards and trusted education portals; newly discovered domains require Admin approval before PDF verification.</p>' + sourceRowsHtml()
      + '<div class="lib-ppd-source-form"><input id="ppd-source-name" placeholder="Source name (e.g. Delhi Public School)"><input id="ppd-source-domain" placeholder="Domain only (e.g. dps.example.edu)"><select id="ppd-source-type"><option value="board">Board</option><option value="school">School</option><option value="education_portal">Education portal</option></select><select id="ppd-source-trust"><option value="official">Official</option><option value="trusted">Trusted</option><option value="review">Review</option></select><button class="btn-small btn-primary" onclick="libPPDAddSource()">Add source</button></div></div>';
    var search = (state.error ? '<div class="hint" style="color:var(--brick);margin:8px 0">' + esc(state.error) + '</div>' : '') + '<div class="lib-ppd-section"><h3>Find question papers online</h3><div class="lib-ppd-search">'
      + '<select id="ppd-scope" onchange="libPPDSetScope(this.value)"><option value="board"' + (state.scope === 'board' ? ' selected' : '') + '>Board papers</option><option value="school"' + (state.scope === 'school' ? ' selected' : '') + '>Individual school papers</option></select>'
      + '<input id="ppd-query" placeholder="e.g. CBSE Class 10 Sanskrit question paper 2025" value="' + esc(state.lastQuery || '') + '">'
      + '<input id="ppd-school-name" placeholder="School name (optional)" value="' + esc(state.lastSchool || '') + '">'
      + '<button class="btn-small btn-primary" onclick="libPPDSearch()" ' + (state.searchBusy ? 'disabled' : '') + '>' + (state.searchBusy ? 'Searching…' : ('Search the web')) + '</button></div>'
      + '<p class="hint">Search results are candidates only. No paper enters the Question Bank until you verify its PDF and explicitly import it.</p>'
      + (state.message ? '<div class="hint" style="color:' + (state.error ? 'var(--brick)' : 'var(--forest)') + ';margin:8px 0">' + esc(state.message) + '</div>' : '') + '</div>';
    var candidates = '<div class="lib-ppd-section"><div class="lib-ppd-title"><h3>Discovered papers (' + state.candidates.length + ')</h3><button class="btn-small" onclick="libPPDRefresh()">Refresh</button></div>'
      + (state.candidates.length ? state.candidates.map(candidateHtml).join('') : '<div class="empty">No candidates yet. Search approved websites to begin.</div>') + '</div>';
    var runs = '<div class="lib-ppd-section"><h3>Recent searches</h3>' + (state.runs.length ? state.runs.map(function (r) {
      var progress = r.filters && r.filters.discovery_progress ? r.filters.discovery_progress : {};
      var progressText = r.status === 'running' ? ' · ' + Number(progress.next_offset || 0) + ' sources processed' : '';
      var resume = r.status === 'running' ? ' <button class="btn-small" onclick="libPPDResumeRun(\\'' + esc(r.id) + '\\')">Resume</button>' : '';
      return '<div class="hint">' + esc(new Date(r.started_at).toLocaleString()) + ' · ' + esc(r.query_text) + ' · ' + esc(r.status) + ' · ' + esc(r.results_found) + ' results' + esc(progressText) + resume + '</div>';
    }).join('') : '<p class="hint">No searches yet.</p>') + '</div>';
    return '<section class="lib-ppd"><style>'
      + '.lib-ppd{border-top:1px solid var(--line);margin-top:14px;padding-top:14px}.lib-ppd h3{font-family:Zilla Slab,serif;margin:0 0 7px}.lib-ppd-section{margin:14px 0 20px}.lib-ppd-search,.lib-ppd-source-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.lib-ppd-search input{flex:1;min-width:190px}.lib-ppd-search select,.lib-ppd-search input,.lib-ppd-source-form input,.lib-ppd-source-form select,.lib-ppd-meta input,.lib-ppd-meta select{min-height:38px;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);box-sizing:border-box}.lib-ppd-source-form input{flex:1;min-width:170px}.lib-ppd-source{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--line)}.lib-ppd-candidate{border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}.lib-ppd-candidate-head,.lib-ppd-title,.lib-ppd-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}.lib-ppd-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px}.lib-ppd-meta label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--muted);font-weight:700}.lib-ppd-meta input,.lib-ppd-meta select{width:100%}.lib-ppd-actions{justify-content:flex-start;margin-top:10px}.lib-ppd-domain-approval{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.lib-ppd-domain-approval select{min-height:34px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}.lib-ppd p.hint{margin:5px 0 10px}@media(max-width:600px){.lib-ppd-search,.lib-ppd-source-form{align-items:stretch}.lib-ppd-search>* ,.lib-ppd-source-form>*{width:100%;min-width:0}.lib-ppd-candidate-head{align-items:flex-start}}'
      + '</style>' + search + sources + candidates + runs + '</section>';
  }

  window.libPPDSetScope = function (v) { state.scope = v === 'school' ? 'school' : 'board'; };
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
      state.message = 'Search complete (' + (result.provider || 'web search') + '): ' + result.found + ' results found; ' + result.new_candidates + ' new candidates saved. Approved-source matches: ' + (result.approved_source_results || 0) + '.' + (result.provider_errors && result.provider_errors.length ? ' Provider warnings: ' + result.provider_errors.slice(0, 3).join(' | ') : '') + ' Unregistered domains need Admin approval before PDF verification.';
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
          ? 'Search complete: ' + result.found + ' results found; ' + result.new_candidates + ' new candidates saved.'
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
    notify('Checking the source page and validating its PDF…');
    try {
      var result = await invoke({ action:'verify', candidate_id:id });
      state.message = result.duplicate ? 'This PDF is already in Past Papers; it has been marked as a duplicate.' : 'PDF verified (' + Math.round(result.file_size_bytes/1024) + ' KB). Review the metadata, then import when ready.';
      state.error = false; state.loaded = false; await loadData(true);
    } catch (e) { state.message = e.message || String(e); state.error = state.message; state.loaded = false; await loadData(true); }
    if (typeof render === 'function') render();
  };
  window.libPPDReject = async function (id) {
    var { error } = await sb.from('qb_paper_discovery_candidates').update({ status:'rejected', reviewed_by:currentUserId, reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', id);
    if (error) { notify('Could not reject candidate: ' + error.message, true); return; }
    state.loaded = false; await loadData(true); notify('Candidate rejected.');
  };
  window.libPPDImport = async function (id) {
    var candidate = state.candidates.find(function (c) { return c.id === id; });
    if (!candidate) return;
    var schoolId = candidate.source_type === 'school' ? val('ppd-school-' + id) : '';
    var boardId = candidate.source_type === 'school' ? '' : val('ppd-board-' + id);
    var gradeId = val('ppd-grade-' + id), subject = val('ppd-subject-' + id).trim();
    var year = Number(val('ppd-year-' + id)), exam = val('ppd-exam-' + id), medium = val('ppd-medium-' + id).trim();
    if ((!schoolId && !boardId) || !gradeId || !subject || !Number.isInteger(year) || !medium) { notify('Complete Board / School, Class, Subject, Year and Medium before importing.', true); return; }
    var { error: approvalError } = await sb.from('qb_paper_discovery_candidates').update({
      status:'approved_for_import', board_id:boardId || null, school_id:schoolId || null, grade_id:gradeId,
      subject_name:subject, year:year, exam_type:exam, medium:medium, reviewed_by:currentUserId,
      reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString()
    }).eq('id', id);
    if (approvalError) { notify('Could not save review metadata: ' + approvalError.message, true); return; }
    notify('Importing verified PDF into the existing Past Papers review queue…');
    try {
      var result = await invoke({ action:'import', candidate_id:id, board_id:boardId, school_id:schoolId, grade_id:gradeId, subject_name:subject, year:year, exam_type:exam, medium:medium });
      state.message = result.message || 'Imported.';
      state.error = false;
      state.loaded = false; await loadData(true);
      if (typeof loadQbSourcePapers === 'function') await loadQbSourcePapers();
    } catch (e) { state.message = e.message || String(e); state.error = state.message; state.loaded = false; await loadData(true); }
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
