/* Student Login attendance: read-only summary sourced from existing sessions and scheduled_classes. */
(function () {
  'use strict';
  if (window.__libStudentAttendanceInstalled) return;

  var stateByStudent = Object.create(null);
  var originalRender = window.renderStudentPortal;
  // Do not mark the module installed until its required portal renderer exists.
  // This allows a later load attempt to succeed if app startup order changes.
  if (typeof originalRender !== 'function') {
    window.__libStudentAttendanceLoadFailed = true;
    return;
  }
  window.__libStudentAttendanceInstalled = true;
  window.__libStudentAttendanceLoadFailed = false;

  function today() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function monthLabel(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  function subjectName(id) {
    var list = typeof subjects !== 'undefined' ? subjects : [];
    var found = list.find(function (x) { return String(x.id) === String(id); });
    return found ? found.name : 'Unassigned subject';
  }
  function teacherName(id) {
    var list = typeof data !== 'undefined' && data.teachers ? data.teachers : [];
    var found = list.find(function (x) { return String(x.id) === String(id); });
    return found ? (found.name || found.code || 'Teacher') : '—';
  }
  function recordsFor(student) {
    var sessions = typeof data !== 'undefined' && Array.isArray(data.sessions) ? data.sessions : [];
    var schedules = typeof scheduledClasses !== 'undefined' && Array.isArray(scheduledClasses) ? scheduledClasses : [];
    var result = sessions.filter(function (r) {
      return String(r.studentId) === String(student.id) && (r.status === 'Present' || r.status === 'Absent');
    }).map(function (r) {
      return { date: String(r.date || '').slice(0, 10), subjectId: r.subjectId, teacherId: r.teacherId, classType: r.classType, status: r.status };
    });
    schedules.forEach(function (r) {
      var date = String(r.date || '').slice(0, 10);
      if (String(r.studentId) === String(student.id) && r.status === 'Pending' && date < today()) {
        result.push({ date: date, subjectId: r.subjectId, teacherId: r.teacherId, classType: r.classType, status: 'Pending Overdue' });
      }
    });
    return result.filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.date); });
  }
  function panel(student) {
    var id = String(student.id);
    var state = stateByStudent[id] || (stateByStudent[id] = { period: 'month', month: today().slice(0, 7) });
    var all = recordsFor(student);
    var keys = all.map(function (r) { return r.date.slice(0, 7); }).sort();
    var earliest = keys.length ? keys[0] : state.month;
    var start = new Date(Number(earliest.slice(0, 4)), Number(earliest.slice(5, 7)) - 1, 1);
    var end = new Date(Number(today().slice(0, 4)), Number(today().slice(5, 7)) - 1, 1);
    var options = [];
    while (start <= end) {
      var k = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0');
      options.push('<option value="' + k + '"' + (state.month === k ? ' selected' : '') + '>' + monthLabel(k) + '</option>');
      start.setMonth(start.getMonth() + 1);
    }
    if (!options.some(function (x) { return x.indexOf('value="' + state.month + '"') !== -1; })) {
      options.push('<option value="' + state.month + '" selected>' + monthLabel(state.month) + '</option>');
    }
    var rows = state.period === 'all' ? all : all.filter(function (r) { return r.date.slice(0, 7) === state.month; });
    var total = { present: 0, absent: 0, overdue: 0 };
    var groups = Object.create(null);
    rows.forEach(function (r) {
      var bucket = r.status === 'Present' ? 'present' : r.status === 'Absent' ? 'absent' : 'overdue';
      total[bucket]++;
      var sid = String(r.subjectId || 'unassigned');
      if (!groups[sid]) groups[sid] = { present: 0, absent: 0, overdue: 0 };
      groups[sid][bucket]++;
    });
    var denominator = total.present + total.absent + total.overdue;
    var overall = denominator ? Math.round(total.present / denominator * 100) + '%' : '—';
    var subjectRows = Object.keys(groups).sort(function (a, b) { return subjectName(a).localeCompare(subjectName(b)); }).map(function (sid) {
      var x = groups[sid], den = x.present + x.absent + x.overdue;
      return '<tr><td><b>' + esc(subjectName(sid)) + '</b></td><td>' + x.present + '</td><td>' + x.absent + '</td><td>' + x.overdue + '</td><td>' + (den ? Math.round(x.present / den * 100) + '%' : '—') + '</td></tr>';
    }).join('');
    var detailRows = rows.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (r) {
      var cls = r.status === 'Present' ? 'present' : r.status === 'Absent' ? 'absent' : 'overdue';
      return '<tr><td>' + esc(r.date) + '</td><td>' + esc(subjectName(r.subjectId)) + '</td><td>' + esc(teacherName(r.teacherId)) + '</td><td>' + esc(r.classType || '—') + '</td><td><span class="lib-att-status ' + cls + '">' + esc(r.status) + '</span></td></tr>';
    }).join('');
    return '<section class="lib-student-attendance"><div class="lib-att-head"><div><h2>My Attendance</h2><p>Overall and subject-wise attendance from your class records.</p></div>'
      + '<div class="lib-att-controls"><label>Period<select data-lib-att-period="' + id + '"><option value="month"' + (state.period === 'month' ? ' selected' : '') + '>By month</option><option value="all"' + (state.period === 'all' ? ' selected' : '') + '>All time</option></select></label>'
      + (state.period === 'month' ? '<label>Month<select data-lib-att-month="' + id + '">' + options.join('') + '</select></label>' : '') + '</div></div>'
      + '<div class="lib-att-kpis"><div><span>Overall attendance</span><strong>' + overall + '</strong></div><div><span>Present</span><strong>' + total.present + '</strong></div><div><span>Absent</span><strong>' + total.absent + '</strong></div><div><span>Pending overdue</span><strong>' + total.overdue + '</strong></div></div>'
      + '<h3>Subject-wise attendance</h3><div class="lib-att-scroll"><table><thead><tr><th>Subject</th><th>Present</th><th>Absent</th><th>Overdue</th><th>Attendance</th></tr></thead><tbody>' + (subjectRows || '<tr><td colspan="5">No attendance records for this period.</td></tr>') + '</tbody></table></div>'
      + '<details class="lib-att-details"><summary>View attendance details (' + rows.length + ')</summary><div class="lib-att-scroll"><table><thead><tr><th>Date</th><th>Subject</th><th>Teacher</th><th>Class type</th><th>Status</th></tr></thead><tbody>' + (detailRows || '<tr><td colspan="5">No attendance records for this period.</td></tr>') + '</tbody></table></div></details>'
      + '<p class="lib-att-note">Attendance = Present ÷ (Present + Absent + Pending Overdue). Future Pending classes are excluded. Overdue reflects currently Pending scheduled classes dated in the past.</p></section>';
  }
  function styles() {
    if (document.getElementById('lib-student-attendance-css')) return;
    var style = document.createElement('style');
    style.id = 'lib-student-attendance-css';
    style.textContent = '.lib-student-attendance{margin:16px 0;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff)}.lib-att-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.lib-att-head h2{margin:0 0 4px}.lib-att-head p,.lib-att-note{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.lib-att-controls{display:flex;gap:9px;flex-wrap:wrap}.lib-att-controls label{display:grid;gap:4px;color:var(--muted);font-size:11px;font-weight:700}.lib-att-controls select{min-height:36px;max-width:190px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper,#fff);color:var(--ink)}.lib-att-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0}.lib-att-kpis>div{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--paper,#faf9f5)}.lib-att-kpis span{display:block;color:var(--muted);font-size:11px}.lib-att-kpis strong{display:block;margin-top:4px;color:var(--ink);font-size:22px}.lib-student-attendance h3{margin:14px 0 8px;font-size:14px}.lib-att-scroll{overflow-x:auto}.lib-student-attendance table{width:100%;border-collapse:collapse;font-size:12px}.lib-student-attendance th,.lib-student-attendance td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.lib-student-attendance th{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.04em}.lib-att-details{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.lib-att-details summary{cursor:pointer;font-size:12px;font-weight:700;color:var(--ink)}.lib-att-status{display:inline-block;padding:3px 7px;border-radius:20px;font-size:10px;font-weight:700}.lib-att-status.present{background:#e4f2e8;color:#24633c}.lib-att-status.absent{background:#fae8e6;color:#9b342b}.lib-att-status.overdue{background:#fff1d5;color:#805b12}.lib-att-note{margin-top:10px}@media(max-width:560px){.lib-att-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.lib-att-controls{width:100%}.lib-att-controls label{flex:1}.lib-att-controls select{width:100%;max-width:none}}';
    document.head.appendChild(style);
  }
  styles();

  window.renderStudentPortal = function () {
    var html = originalRender.apply(this, arguments);
    if (typeof currentRole !== 'undefined' && currentRole === 'Student') {
      // Match the academics panel by its stable ID and role, without depending on
      // whitespace or whether optional attributes are present on the opening tag.
      var academicsOpen = /<section\\b(?=[^>]*\\bid=["']student-portal-academics["'])(?=[^>]*\\brole=["']tabpanel["'])[^>]*>/i;
      var funPanelStart = '</section><section id="student-portal-fun"';
      if (academicsOpen.test(html) && html.indexOf('class="lib-student-attendance"') === -1
          && html.indexOf(funPanelStart) !== -1) {
        var student = typeof data !== 'undefined' && Array.isArray(data.students)
          ? data.students.find(function (s) { return String(s.id) === String(currentLinkedId); })
          : null;
        if (student) html = html.replace(funPanelStart, panel(student) + funPanelStart);
      }
    }
    return html;
  };

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var studentId = target.getAttribute('data-lib-att-period') || target.getAttribute('data-lib-att-month');
    if (!studentId || !stateByStudent[studentId]) return;
    if (target.hasAttribute('data-lib-att-period')) stateByStudent[studentId].period = target.value;
    if (target.hasAttribute('data-lib-att-month')) stateByStudent[studentId].month = target.value;
    if (typeof render === 'function') render();
  });
  if (typeof currentRole !== 'undefined' && currentRole === 'Student' && typeof render === 'function') render();
})();
