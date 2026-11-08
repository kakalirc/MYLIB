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
    return tabByStudent[key] === 'fun' ? 'fun' : 'academics';
  }

  window.setStudentPortalSection = function (tab) {
    if (tab !== 'academics' && tab !== 'fun') return;
    var key = studentKey();
    if (!key) return;
    tabByStudent[key] = tab;
    if (typeof render === 'function') render();
  };

  function funZoneHtml() {
    var arenaUrl = new URL('knowledge-arena/knowledge-arena.html?view=student', document.baseURI).href;
    return '<section class="student-fun-zone" aria-labelledby="student-fun-heading">'
      + '<div class="student-fun-hero">'
      + '<p class="student-fun-eyebrow">A space for curiosity and play</p>'
      + '<h2 id="student-fun-heading">Welcome to Fun Zone!</h2>'
      + '<p>Take a break from your regular lessons. Explore quizzes, brain teasers, memory challenges and daily knowledge games. Your game rewards will be separate from your attendance rewards.</p>'
      + '<a class="student-fun-launch" href="' + arenaUrl + '" target="_blank" rel="noopener">Enter Knowledge Arena <span aria-hidden="true">↗</span></a>'
      + '</div>'
      + '<div class="student-fun-grid">'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🎯</div><h3>Daily Challenges</h3><p>Try a fresh mix of questions and build a regular play habit.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🧩</div><h3>Games & Brain Teasers</h3><p>Explore language, maths, science, general knowledge, logic and memory games.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">⭐</div><h3>Game XP & Levels</h3><p>Earn Knowledge Arena XP as you play. These rewards are independent of class attendance XP.</p></article>'
      + '<article class="student-fun-card"><div class="student-fun-card-icon" aria-hidden="true">🏆</div><h3>Badges & Leaderboard</h3><p>Celebrate game achievements and compare progress on the Knowledge Arena leaderboard.</p></article>'
      + '</div>'
      + '<div class="student-fun-preview-note"><b>Preview status:</b> Knowledge Arena currently opens an interactive prototype with sample questions and browser-only scores. It is not yet connected to student accounts or live saved progress.</div>'
      + '</section>';
  }

  window.renderStudentPortal = function () {
    var academicHtml = originalRenderStudentPortal.apply(this, arguments);

    // Keep the existing full-screen practice-paper experience unchanged.
    try { if (typeof spOpen !== 'undefined' && spOpen) return academicHtml; } catch (e) {}

    var selected = activeTab();
    return '<div class="student-portal-section-switcher" role="tablist" aria-label="Student portal sections">'
      + '<button type="button" class="student-portal-section-tab" role="tab" aria-selected="' + (selected === 'academics') + '" aria-controls="student-portal-academics" onclick="setStudentPortalSection(\'academics\')">📚 My Learning</button>'
      + '<button type="button" class="student-portal-section-tab" role="tab" aria-selected="' + (selected === 'fun') + '" aria-controls="student-portal-fun" onclick="setStudentPortalSection(\'fun\')">🎮 Fun Zone</button>'
      + '</div>'
      + '<section id="student-portal-academics" role="tabpanel" ' + (selected === 'academics' ? '' : 'hidden') + '>'
      + academicHtml
      + '</section>'
      + '<section id="student-portal-fun" role="tabpanel" ' + (selected === 'fun' ? '' : 'hidden') + '>'
      + funZoneHtml()
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
