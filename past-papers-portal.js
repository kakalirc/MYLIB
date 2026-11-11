/* My LIB — published Past Papers for Student and Parent portals.
 * Catalogue visibility is enforced by Supabase RLS and private Storage policies;
 * this file only renders the read-only portal experience.
 */
(function () {
  'use strict';
  if (window.__libPastPapersPortalInstalled) return;
  window.__libPastPapersPortalInstalled = true;

  var studentPaperTabs = Object.create(null);
  var parentPaperTabs = Object.create(null);
  var publishedPapers = [];
  var schoolDirectory = [];
  var papersLoaded = false;
  var papersLoading = false;
  var papersError = '';
  var paperFilters = { boardId: '', schoolId: '', gradeId: '', subject: '', year: '' };
  var studentSubjectNames = [];
  var studentScopeLoaded = false;
  var activeFilterStudentId = '';
  var studentGradeId = '';

  function syncStudentDefaults() {
    if (typeof currentRole === 'undefined' || currentRole !== 'Student'
        || typeof currentLinkedId === 'undefined' || !currentLinkedId) return;
    var id = String(currentLinkedId);
    if (activeFilterStudentId === id) return;
    activeFilterStudentId = id;
    studentGradeId = '';
    paperFilters = { boardId: '', schoolId: '', gradeId: '', subject: '__my_subjects__', year: '' };
    studentSubjectNames = [];
    studentScopeLoaded = false;
    papersLoaded = false;
  }

  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function labelFor(list, id) {
    var row = (list || []).find(function (item) { return item && item.id === id; });
    return row && row.name ? row.name : '';
  }
  function optionList(values, selected, allLabel) {
    return '<option value="">' + escHtml(allLabel) + '</option>' + values.map(function (item) {
      return '<option value="' + escHtml(item.value) + '"' + (String(selected) === String(item.value) ? ' selected' : '') + '>' + escHtml(item.label) + '</option>';
    }).join('');
  }
  function distinctOptions(key, labelFn, sortYear) {
    var seen = Object.create(null), result = [];
    publishedPapers.forEach(function (paper) {
      var value = paper[key];
      if (value == null || value === '') return;
      value = String(value);
      if (seen[value]) return;
      seen[value] = true;
      result.push({ value: value, label: String(labelFn(paper) || value) });
    });
    result.sort(function (a, b) {
      return sortYear ? Number(b.value) - Number(a.value) : a.label.localeCompare(b.label, undefined, { numeric: true });
    });
    return result;
  }
  async function loadPublishedPapers(force) {
    if (papersLoading || (papersLoaded && !force) || typeof sb === 'undefined' || !sb) return;
    papersLoading = true;
    papersError = '';
    try {
      syncStudentDefaults();
      var results = await Promise.all([
        sb.from('qb_source_papers')
          .select('id,source_type,school_id,board_id,grade_id,subject_name,year,exam_type,medium,question_count,stored_pdf_url,source_url')
          .eq('status', 'published')
          .order('year', { ascending: false })
          .limit(2000),
        sb.from('qb_schools').select('id,name').eq('archived', false).order('name')
      ]);
      if (results[0].error) throw results[0].error;
      publishedPapers = results[0].data || [];
      schoolDirectory = results[1].error ? [] : (results[1].data || []);
      if (typeof currentRole !== 'undefined' && currentRole === 'Student'
          && typeof currentLinkedId !== 'undefined' && currentLinkedId) {
        var studentResult = await sb.from('students').select('grade_id').eq('id', currentLinkedId).maybeSingle();
        if (!studentResult.error && studentResult.data && studentResult.data.grade_id) {
          studentGradeId = String(studentResult.data.grade_id);
          paperFilters.gradeId = studentGradeId;
        }
        var enrollmentResult = await sb.from('student_subjects').select('subject_id').eq('student_id', currentLinkedId);
        if (!enrollmentResult.error) {
          var subjectIds = (enrollmentResult.data || []).map(function (row) { return row.subject_id; }).filter(Boolean);
          if (subjectIds.length) {
            var subjectResult = await sb.from('subjects').select('id,name').in('id', subjectIds);
            if (!subjectResult.error) studentSubjectNames = (subjectResult.data || []).map(function (row) { return String(row.name || '').trim(); }).filter(Boolean);
          }
          studentScopeLoaded = true;
        }
      }
      papersLoaded = true;
    } catch (error) {
      papersError = error && error.message ? error.message : 'Could not load published question papers.';
      publishedPapers = [];
      papersLoaded = false;
    } finally {
      papersLoading = false;
      if (typeof render === 'function' && typeof isLoggedIn !== 'undefined' && isLoggedIn
          && (currentRole === 'Student' || currentRole === 'Parent')) render();
    }
  }

  function filterControl(key, allLabel, options) {
    return '<label class="lib-past-paper-filter"><span>' + escHtml(allLabel) + '</span>'
      + '<select aria-label="' + escHtml(allLabel) + '" onchange="libSetPastPaperFilter(\'' + key + '\',this.value)">'
      + optionList(options, paperFilters[key], allLabel) + '</select></label>';
  }
  function renderPublishedPapers() {
    syncStudentDefaults();
    if (papersError) return '<div class="card"><div class="hint" style="color:var(--brick)">' + escHtml(papersError) + '</div><button class="btn-small" onclick="libRefreshPastPapers()">Try again</button></div>';
    if (!papersLoaded && !papersLoading) loadPublishedPapers(false);
    if (papersLoading) return '<div class="card"><div class="empty">Loading published question papers…</div></div>';

    var boardsList = typeof boards !== 'undefined' ? boards : [];
    var gradesList = typeof grades !== 'undefined' ? grades : [];
    var boardOptions = distinctOptions('board_id', function (p) { return labelFor(boardsList, p.board_id) || 'Board'; }).filter(function (o) { return !!o.value; });
    var schoolOptions = distinctOptions('school_id', function (p) { return labelFor(schoolDirectory, p.school_id) || 'School'; }).filter(function (o) { return !!o.value; });
    var isStudentView = typeof currentRole !== 'undefined' && currentRole === 'Student';
    var gradeOptions = distinctOptions('grade_id', function (p) { return labelFor(gradesList, p.grade_id) || 'Class'; }).filter(function (o) { return !!o.value; });
    if (isStudentView && studentGradeId && !gradeOptions.some(function (o) { return o.value === studentGradeId; })) {
      var ownGradeName = labelFor(gradesList, studentGradeId);
      if (ownGradeName) gradeOptions.push({ value: studentGradeId, label: ownGradeName });
    }
    var subjectOptions = distinctOptions('subject_name', function (p) { return p.subject_name; });
    if (isStudentView) subjectOptions.unshift({ value: '__my_subjects__', label: 'My Subjects' });
    var yearOptions = distinctOptions('year', function (p) { return String(p.year); }, true);

    var filters = '<div class="lib-past-paper-filters">'
      + filterControl('boardId', 'All Boards', boardOptions)
      + filterControl('schoolId', 'All Schools', schoolOptions)
      + filterControl('gradeId', 'All Classes', gradeOptions)
      + filterControl('subject', 'All Subjects', subjectOptions)
      + filterControl('year', 'All Years', yearOptions)
      + '<button class="btn-small" type="button" onclick="libClearPastPaperFilters()">Clear filters</button>'
      + '</div>';

    var visible = publishedPapers.filter(function (p) {
      return (!isStudentView || paperFilters.subject !== '__my_subjects__' || (studentScopeLoaded && studentSubjectNames.indexOf(String(p.subject_name || '').trim()) !== -1))
        && (!paperFilters.boardId || p.board_id === paperFilters.boardId)
        && (!paperFilters.schoolId || p.school_id === paperFilters.schoolId)
        && (!paperFilters.gradeId || p.grade_id === paperFilters.gradeId)
        && (!paperFilters.subject || p.subject_name === paperFilters.subject)
        && (!paperFilters.year || String(p.year) === paperFilters.year);
    });
    var cards = visible.map(function (p) {
      var source = p.source_type === 'school'
        ? 'School · ' + (labelFor(schoolDirectory, p.school_id) || 'School')
        : 'Board · ' + (labelFor(boardsList, p.board_id) || 'Board');
      var meta = [source, labelFor(gradesList, p.grade_id), p.subject_name, p.year,
        p.exam_type ? String(p.exam_type).replace(/_/g, ' ') : '', p.medium].filter(Boolean);
      return '<article class="lib-past-paper-card"><div class="lib-past-paper-card-main">'
        + '<h3>' + escHtml(p.subject_name || 'Question Paper') + '</h3>'
        + '<p>' + escHtml(meta.join(' · ')) + '</p>'
        + (p.question_count ? '<span class="hint">' + escHtml(p.question_count) + ' questions</span>' : '')
        + '</div><button class="btn-small btn-primary" type="button" onclick="libOpenPublishedPastPaper(\'' + escHtml(p.id) + '\')">View / Download PDF</button></article>';
    }).join('');

    return '<section class="lib-past-papers"><div class="card">'
      + '<div class="lib-past-paper-heading"><div><h2>Question Bank</h2><p class="hint">Browse published question papers from all available Boards and Schools, classes and subjects.</p></div>'
      + '<button class="btn-small" type="button" onclick="libRefreshPastPapers()">↻ Refresh</button></div>'
      + filters + '<div class="hint" style="margin:10px 0 12px">' + visible.length + ' published paper' + (visible.length === 1 ? '' : 's') + '</div>'
      + (cards || '<div class="empty">No published question papers match these filters.</div>')
      + '</div></section>';
  }

  function addStyles() {
    if (document.getElementById('lib-past-papers-portal-css')) return;
    var style = document.createElement('style');
    style.id = 'lib-past-papers-portal-css';
    style.textContent = [
      '.lib-past-paper-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 16px;padding:8px;background:var(--paper);border:1px solid var(--line);border-radius:10px}',
      '.lib-past-paper-tab{background:transparent;border:1px solid transparent;color:var(--muted);padding:8px 12px;border-radius:7px;font-size:13px}',
      '.lib-past-paper-tab[aria-selected="true"]{background:var(--brick);color:#fff;border-color:var(--brick)}',
      '.lib-past-paper-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;align-items:end;margin:14px 0}',
      '.lib-past-paper-filter{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:var(--muted)}',
      '.lib-past-paper-filter select{width:100%;min-width:0;min-height:38px}',
      '.lib-past-paper-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}',
      '.lib-past-paper-heading h2{margin:0 0 4px}.lib-past-paper-heading p{margin:0}',
      '.lib-past-paper-card{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 0;border-top:1px solid var(--line)}',
      '.lib-past-paper-card h3{font-size:15px;color:var(--ink);margin:0 0 4px;font-family:"Work Sans",sans-serif}',
      '.lib-past-paper-card p{font-size:12px;color:var(--muted);margin:0 0 4px;line-height:1.5}',
      '@media(max-width:560px){.lib-past-paper-card{align-items:flex-start}.lib-past-paper-card button{width:100%}.lib-past-paper-filters{grid-template-columns:1fr 1fr}}'
    ].join('');
    document.head.appendChild(style);
  }

  window.libSetPastPaperFilter = function (key, value) {
    if (!Object.prototype.hasOwnProperty.call(paperFilters, key)) return;
    paperFilters[key] = value;
    if (key === 'boardId' && value) paperFilters.schoolId = '';
    if (key === 'schoolId' && value) paperFilters.boardId = '';
    if (typeof render === 'function') render();
  };
  window.libClearPastPaperFilters = function () {
    syncStudentDefaults();
    paperFilters = { boardId: '', schoolId: '', gradeId: studentGradeId || '', subject: currentRole === 'Student' ? '__my_subjects__' : '', year: '' };
    if (typeof render === 'function') render();
  };
  window.libRefreshPastPapers = function () {
    papersLoaded = false;
    loadPublishedPapers(true);
    if (typeof render === 'function') render();
  };
  window.libOpenPublishedPastPaper = async function (id) {
    if (typeof currentRole === 'undefined' || (currentRole !== 'Student' && currentRole !== 'Parent')) return;
    var paper = publishedPapers.find(function (p) { return p.id === id; });
    if (!paper) return;
    var popup = window.open('', '_blank');
    if (!popup) { alert('Please allow pop-ups for this site, then try again.'); return; }
    popup.opener = null;
    popup.document.write('<!doctype html><title>Opening question paper</title><p style="font:14px sans-serif;padding:20px">Opening question paper…</p>');
    try {
      var href = '';
      var stored = String(paper.stored_pdf_url || '');
      var match = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
      var ref = match
        ? { bucket: match[1], path: decodeURIComponent(match[2]) }
        : (!/^https?:/i.test(stored) && stored.indexOf('/') > 0
            ? { bucket: stored.slice(0, stored.indexOf('/')), path: stored.slice(stored.indexOf('/') + 1) }
            : null);
      if (ref) {
        if (ref.bucket !== 'qb-papers') throw new Error('This paper is not stored in the approved question-paper library.');
        var signed = await sb.storage.from('qb-papers').createSignedUrl(ref.path, 3600);
        if (signed.error || !signed.data || !signed.data.signedUrl) throw (signed.error || new Error('Could not create a secure PDF link.'));
        href = signed.data.signedUrl;
      } else if (!stored && /^https:\/\//i.test(String(paper.source_url || ''))) {
        href = paper.source_url;
      } else if (/^https:\/\//i.test(stored) && !/\/storage\/v1\/object\/sign\//i.test(stored)) {
        href = stored;
      }
      if (!href) throw new Error('No PDF is available for this paper yet.');
      popup.location.replace(href);
    } catch (error) {
      popup.close();
      alert(error && error.message ? error.message : 'Could not open this question paper.');
    }
  };

  function studentTabsHtml(selected) {
    return '<div class="lib-past-paper-tabs" role="tablist" aria-label="Student portal sections">'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'learning') + '" onclick="libExitPastPapersAndGo(\'academics\')">📚 My Learning</button>'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'fun') + '" onclick="libExitPastPapersAndGo(\'fun\')">🎮 Fun Zone</button>'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'papers') + '" onclick="libSetStudentPastPapersTab()">📄 Question Bank</button>'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'settings') + '" onclick="libExitPastPapersAndGo(\'settings\')">⚙️ Settings</button>'
      + '</div>';
  }
  function parentTabsHtml(selected) {
    return '<div class="lib-past-paper-tabs" role="tablist" aria-label="Parent portal sections">'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'overview') + '" onclick="libSetParentPastPapersTab(\'overview\')">🏠 Overview</button>'
      + '<button class="lib-past-paper-tab" role="tab" aria-selected="' + (selected === 'papers') + '" onclick="libSetParentPastPapersTab(\'papers\')">📄 Question Bank</button>'
      + '</div>';
  }
  function parentChildren() {
    return (data.parentStudents || []).filter(function (link) { return link.parentUserId === currentUserId; })
      .map(function (link) { return (data.students || []).find(function (student) { return student.id === link.studentId; }); })
      .filter(Boolean);
  }
  function parentChildSwitcher(children) {
    var child = children.find(function (item) { return item.id === parentSelectedChildId; });
    if (!child) return '';
    if (children.length === 1) return '<div class="card"><div class="hint">Viewing: <b>' + escHtml(child.name) + '</b></div></div>';
    return '<div class="card"><div class="row-form" style="margin-bottom:0"><span style="font-family:Zilla Slab,serif;font-size:17px;font-weight:600">Viewing:</span>'
      + '<select aria-label="Select child" onchange="setParentSelectedChild(this.value)">'
      + children.map(function (item) { return '<option value="' + escHtml(item.id) + '"' + (item.id === child.id ? ' selected' : '') + '>' + escHtml(item.name) + (item.archived ? ' (archived)' : '') + '</option>'; }).join('')
      + '</select></div></div>';
  }
  window.libSetStudentPastPapersTab = function () {
    if (currentRole !== 'Student') return;
    studentPaperTabs[currentLinkedId] = 'papers';
    addStyles();
    loadPublishedPapers(false);
    render();
  };
  window.libSetParentPastPapersTab = function (tab) {
    if (currentRole !== 'Parent' || (tab !== 'overview' && tab !== 'papers')) return;
    parentPaperTabs[currentUserId] = tab;
    addStyles();
    if (tab === 'papers') loadPublishedPapers(false);
    render();
  };
  window.libExitPastPapersAndGo = function (section) {
    if (currentRole !== 'Student') return;
    delete studentPaperTabs[currentLinkedId];
    if (typeof setStudentPortalSection === 'function') setStudentPortalSection(section);
    else render();
  };

  var originalStudentPortal = window.renderStudentPortal;
  if (typeof originalStudentPortal === 'function') {
    window.renderStudentPortal = function () {
      if (typeof currentRole !== 'undefined' && currentRole === 'Student'
          && !(typeof spOpen !== 'undefined' && spOpen)
          && studentPaperTabs[currentLinkedId] === 'papers') {
        addStyles();
        return studentTabsHtml('papers') + renderPublishedPapers();
      }
      var html = originalStudentPortal.apply(this, arguments);
      if (typeof currentRole !== 'undefined' && currentRole === 'Student' && !(typeof spOpen !== 'undefined' && spOpen)) {
        addStyles();
        return html.replace(/(<div class="student-portal-section-switcher"[\s\S]*?)(<\/div>)/,
          '$1<button type="button" class="student-portal-section-tab" role="tab" aria-selected="false" onclick="libSetStudentPastPapersTab()">📄 Question Bank</button>$2');
      }
      return html;
    };
  }

  var originalParentPortal = window.renderParentPortal;
  if (typeof originalParentPortal === 'function') {
    window.renderParentPortal = function () {
      if (typeof currentRole !== 'undefined' && currentRole === 'Parent') {
        var children = parentChildren();
        if (!children.length) return originalParentPortal.apply(this, arguments);
        if (!parentSelectedChildId || !children.some(function (child) { return child.id === parentSelectedChildId; })) {
          parentSelectedChildId = children[0].id;
        }
        var selected = parentPaperTabs[currentUserId] || 'overview';
        addStyles();
        if (selected === 'papers') {
          loadPublishedPapers(false);
          return parentTabsHtml('papers') + parentChildSwitcher(children) + renderPublishedPapers();
        }
        return parentTabsHtml('overview') + originalParentPortal.apply(this, arguments);
      }
      return originalParentPortal.apply(this, arguments);
    };
  }

  // The main app may finish restoring a saved session before this deferred module loads.
  try {
    if (typeof isLoggedIn !== 'undefined' && isLoggedIn && typeof loaded !== 'undefined' && loaded
        && typeof currentRole !== 'undefined' && (currentRole === 'Student' || currentRole === 'Parent')
        && typeof render === 'function') render();
  } catch (error) {}
})();