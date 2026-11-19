/* My LIB Student Portal helpers. The student menu itself (Home, Homework, Study, Fun, Me)
 * lives in index.html (renderStudentPortal). This file gives it the Fun Zone page and the
 * password / quick-login cards, loads the attendance panel, and adds the admin Knowledge
 * Arena link. Knowledge Arena has its own separate Game XP system.
 */
(function () {
  'use strict';

  if (window.__libStudentPortalTabsInstalled) return;
  if (typeof window.renderStudentPortal !== 'function') return;
  window.__libStudentPortalTabsInstalled = true;

  // Load attendance relative to this script, not the document base URL. This keeps
  // the module path correct when the app is served from a nested route or uses a <base> tag.
  if (!window.__libStudentAttendanceLoader && !window.__libStudentAttendanceInstalled) {
    window.__libStudentAttendanceLoader = true;
    var portalTabsScriptUrl = document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : document.baseURI;
    var attendanceScript = document.createElement('script');
    attendanceScript.src = new URL('student-attendance.js?v=20261119-menu2', portalTabsScriptUrl).href;
    attendanceScript.async = true;
    attendanceScript.onerror = function () {
      window.__libStudentAttendanceLoadFailed = true;
      window.__libStudentAttendanceLoader = false;
    };
    document.head.appendChild(attendanceScript);
  }

  var originalRenderPortalShell = window.renderPortalShell;
  var styleId = 'lib-student-portal-tabs-css';

  if (!document.getElementById(styleId)) {
    var link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = new URL('student-portal-tabs.css', document.currentScript.src).href;
    document.head.appendChild(link);
  }

  // Password + quick login cards for the student's Me > My account page (index.html calls this).
  window.studentAccountSettingsHtml = function () {
    return '<section class="student-settings-zone" id="student-portal-settings">'
      + '<div class="card"><h2>Change your password</h2>'
      + (userMsg.changePw ? '<div class="hint" style="color:var(--forest)">' + escapeHtml(userMsg.changePw) + '</div>' : '')
      + '<div class="narrow-form">'
      + '<input type="password" autocomplete="current-password" id="curPass" placeholder="Current password">'
      + '<input type="password" autocomplete="new-password" id="newPass1" placeholder="New password">'
      + '<input type="password" autocomplete="new-password" id="newPass2" placeholder="Confirm new password">'
      + '<button class="btn-primary" onclick="changePassword()">Save new password</button>'
      + '</div></div>' + bioSettingsCardHtml() + '</section>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  if (typeof originalRenderPortalShell === 'function') {
    window.renderPortalShell = function (bodyHtml) {
      var result = originalRenderPortalShell.apply(this, arguments);
      if (typeof currentRole !== 'undefined' && currentRole === 'Admin') {
        var topbar = document.querySelector('#app .topbar');
        if (topbar && !document.getElementById('libKnowledgeArenaAdminLink')) {
          var link = document.createElement('a');
          link.id = 'libKnowledgeArenaAdminLink';
          link.className = 'btn-small';
          link.href = new URL('knowledge-arena/knowledge-arena.html?view=admin', document.baseURI).href;
          link.textContent = 'Knowledge Arena';
          var who = topbar.querySelector('.who');
          if (who) who.insertAdjacentElement('afterend', link);
          else topbar.appendChild(link);
        }
      }
      return result;
    };
  }

  // Fun Zone page for the student menu (index.html calls this).
  window.studentFunZoneHtml = function () {
    var arenaUrl = new URL('knowledge-arena/knowledge-arena.html', document.baseURI).href;
    return '<section class="student-fun-zone" aria-labelledby="student-fun-heading">'
      + '<div class="student-fun-hero">'
      + '<p class="student-fun-eyebrow">A space for curiosity and play</p>'
      + '<h2 id="student-fun-heading">Welcome to Fun Zone!</h2>'
      + '<p>Take a break from your regular lessons. Explore quizzes, brain teasers, memory challenges and daily knowledge games. Your game rewards will be separate from your attendance rewards.</p>'
      + '<a class="student-fun-launch" href="' + arenaUrl + '?view=play">Enter Knowledge Arena <span aria-hidden="true">→</span></a>'
      + '</div>'
      + '<div class="student-fun-grid">'
      + '<a class="student-fun-card" href="' + arenaUrl + '?view=daily"><div class="student-fun-card-icon" aria-hidden="true">🎯</div><h3>Daily Challenges</h3><p>Try a fresh mix of questions and build a regular play habit.</p><span class="student-fun-card-action">Explore challenges →</span></a>'
      + '<a class="student-fun-card" href="' + arenaUrl + '?view=play"><div class="student-fun-card-icon" aria-hidden="true">🧩</div><h3>Games &amp; Brain Teasers</h3><p>Explore language, maths, science, general knowledge, logic and memory games.</p><span class="student-fun-card-action">Choose a game →</span></a>'
      + '<a class="student-fun-card" href="' + arenaUrl + '?view=progress"><div class="student-fun-card-icon" aria-hidden="true">⭐</div><h3>Game XP &amp; Levels</h3><p>Earn Knowledge Arena XP as you play. These rewards are independent of class attendance XP.</p><span class="student-fun-card-action">View my progress →</span></a>'
      + '<a class="student-fun-card" href="' + arenaUrl + '?view=achievements"><div class="student-fun-card-icon" aria-hidden="true">🏆</div><h3>Badges &amp; Leaderboard</h3><p>Celebrate game achievements and compare progress on the Knowledge Arena leaderboard.</p><span class="student-fun-card-action">View badges &amp; leaderboard →</span></a>'
      + '</div>'
      + '<div class="student-fun-preview-note"><b>Knowledge Arena:</b> Opens with your existing LIB login. Live scores and Game XP are saved to your student account when the Knowledge Arena service is enabled; preview-mode scores are never saved.</div>'
      + '</section>';
  }

  // If a restored session finished rendering before this file loaded, apply the tabs once now.
  try {
    if (typeof isLoggedIn !== 'undefined' && isLoggedIn && typeof loaded !== 'undefined' && loaded
        && typeof currentRole !== 'undefined' && currentRole === 'Student' && typeof render === 'function') {
      render();
    }
  } catch (e) {}
})();
