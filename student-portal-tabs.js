/* My LIB Student Portal: separate academic work from recreational learning games.
 * Existing attendance XP, badges, streaks and attendance leaderboard remain in My Learning
 * without changing their calculations. Knowledge Arena has its own separate Game XP system.
 */
(function () {
  'use strict';

  if (window.__libStudentPortalTabsInstalled) return;
  if (typeof window.renderStudentPortal !== 'function') return;
  window.__libStudentPortalTabsInstalled = true;

  var originalRenderStudentPortal = window.renderStudentPortal;
  var originalRenderPortalShell = window.renderPortalShell;
  var tabByStudent = Object.create(null);
  var styleId = 'lib-student-portal-tabs-css';

  if (!document.getElementById(styleId)) {
    var link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = new URL('student-portal-tabs.css', document.currentScript.src).href;
    document.head.appendChild(link);
  }

  function studentKey() {
    try { return typeof currentLinkedId !== 'undefined' ? String(currentLinkedId || '') : ''; }
    catch (e) { return ''; }
  }

  function activeTab() {
    var key = studentKey();
    return tabByStudent[key] === 'fun' || tabByStudent[key] === 'settings' ? tabByStudent[key] : 'academics';
  }

  window.setStudentPortalSection = function (tab) {
    if (tab !== 'academics' && tab !== 'fun' && tab !== 'settings') return;
    var key = studentKey();
    if (!key) return;
    tabByStudent[key] = tab;
    window.scrollTo(0, 0);
    if (typeof render === 'function') render();
  };


  function studentSettingsHtml() {
    return '<section class="student-settings-zone" aria-labelledby="student-settings-heading">'
      + '<h2 id="student-settings-heading" class="student-settings-title">Account settings</h2>'
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
      if (typeof currentRole !== 'undefined' && currentRole === 'Student') {
        Array.prototype.forEach.call(document.querySelectorAll('#app .card'), function (card) {
          if (card.closest('#student-portal-settings')) return;
          var heading = card.querySelector('h2');
          if (!heading) return;
          var title = heading.textContent.trim().toLowerCase();
          if (title === 'change your password' || title === 'quick login') card.remove();
        });
        Array.prototype.forEach.call(document.querySelectorAll('#app button'), function (button) {
          if (button.textContent.trim() === 'Change it now') {
            button.onclick = function () { window.openStudentSettings(); };
          }
        });
      }
      return result;
    };
  }

  window.openStudentSettings = function () {
    window.setStudentPortalSection('settings');
    var input = document.getElementById('curPass');
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }
  };

  function funZoneHtml() {
    var arenaUrl = new URL('knowledge-arena/knowledge-arena.html?view=student', document.baseURI).href;
    return '<section class="student-fun-zone" aria-labelledby="student-fun-heading">'
      + '<div class="student-fun-hero">'
      + '<p class="student-fun-eyebrow">A space for curiosity and play</p>'
      + '<h2 id="student-fun-heading">Welcome to Fun Zone!</h2>'
      + '<p>Take a break from your regular lessons. Explore quizzes, brain teasers, memory challenges and daily knowledge games. Your game rewards will be separate from your attendance rewards.</p>'
      + '<a class="student-fun-launch" href="' + arenaUrl + '">Enter Knowledge Arena <span aria-hidden="true">→</span></a>'
      + '</div>'
      + '<div class="student-fun-grid">'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🎯</div><h3>Daily Challenges</h3><p>Try a fresh mix of questions and build a regular play habit.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🧩</div><h3>Games & Brain Teasers</h3><p>Explore language, maths, science, general knowledge, logic and memory games.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">⭐</div><h3>Game XP & Levels</h3><p>Earn Knowledge Arena XP as you play. These rewards are independent of class attendance XP.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🏆</div><h3>Badges & Leaderboard</h3><p>Celebrate game achievements and compare progress on the Knowledge Arena leaderboard.</p></article>'
      + '</div>'
      + '<div class="student-fun-preview-note"><b>Knowledge Arena:</b> Opens with your existing LIB login. Live scores and Game XP are saved to your student account when the Knowledge Arena service is enabled; preview-mode scores are never saved.</div>'
      + '</section>';
  }

  window.renderStudentPortal = function () {
    var selected = activeTab();

    // Keep the existing full-screen practice-paper experience unchanged.
    try {
      if (typeof spOpen !== 'undefined' && spOpen) return originalRenderStudentPortal.apply(this, arguments);
    } catch (e) {}

    // Avoid loading academic-only widgets (such as the attendance leaderboard) while Fun Zone is open.
    var academicHtml = selected === 'academics' ? originalRenderStudentPortal.apply(this, arguments) : '';
    return '<div class="student-portal-section-switcher" role="tablist" aria-label="Student portal sections">'
      + '<button type="button" class="student-portal-section-tab" role="tab" aria-selected="' + (selected === 'academics') + '" aria-controls="student-portal-academics" onclick="setStudentPortalSection(\'academics\')">📚 My Learning</button>'
      + '<button type="button" class="student-portal-section-tab" role="tab" aria-selected="' + (selected === 'fun') + '" aria-controls="student-portal-fun" onclick="setStudentPortalSection(\'fun\')">🎮 Fun Zone</button>'
      + '<button type="button" class="student-portal-section-tab" role="tab" aria-selected="' + (selected === 'settings') + '" aria-controls="student-portal-settings" onclick="setStudentPortalSection(\'settings\')">⚙️ Settings</button>'
      + '</div>'
      + '<section id="student-portal-academics" role="tabpanel" ' + (selected === 'academics' ? '' : 'hidden') + '>'
      + academicHtml
      + '</section>'
      + '<section id="student-portal-fun" role="tabpanel" ' + (selected === 'fun' ? '' : 'hidden') + '>'
      + (selected === 'fun' ? funZoneHtml() : '')
      + '</section>'
      + '<section id="student-portal-settings" role="tabpanel" ' + (selected === 'settings' ? '' : 'hidden') + '>'
      + (selected === 'settings' ? studentSettingsHtml() : '')
      + '</section>';
  };

  // If a restored session finished rendering before this file loaded, apply the tabs once now.
  try {
    if (typeof isLoggedIn !== 'undefined' && isLoggedIn && typeof loaded !== 'undefined' && loaded
        && typeof currentRole !== 'undefined' && currentRole === 'Student' && typeof render === 'function') {
      render();
    }
  } catch (e) {}
})();
