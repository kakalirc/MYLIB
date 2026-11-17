/* Production UI guard and deployment release attribution.
 * The unfinished Question Bank shell remains available for development, but its
 * temporary Admin preview launcher is hidden. Teacher-only Question Bank fixes
 * are applied here without changing Admin duplicate-review behaviour.
 */
(() => {
  'use strict';

  const PREVIEW_LABEL = 'Preview new Question Bank module';

  function isTeacher() {
    return typeof currentRole !== 'undefined' && String(currentRole).toLowerCase() === 'teacher';
  }

  function removePreviewLauncher(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('button').forEach((button) => {
      if ((button.textContent || '').trim() !== PREVIEW_LABEL) return;
      const wrapper = button.parentElement;
      if (wrapper && wrapper.children.length === 1 && wrapper.tagName === 'DIV') wrapper.remove();
      else button.remove();
    });
  }

  function suppressTeacherDuplicateSummary(root) {
    if (!isTeacher() || !root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('h1,h2,h3,h4,strong,b').forEach((heading) => {
      if ((heading.textContent || '').trim().toLowerCase() !== 'possible duplicate papers grouped together') return;
      let target = heading;
      for (let depth = 0; depth < 7 && target.parentElement; depth += 1) {
        target = target.parentElement;
        const content = target.textContent || '';
        if (content.includes('Papers with matching details are candidates for comparison')
            && content.length < 1800
            && target.querySelectorAll('button').length === 0) {
          target.style.setProperty('display', 'none', 'important');
          target.setAttribute('aria-hidden', 'true');
          break;
        }
      }
    });
  }

  let teacherQuestionBankWasVisible = false;
  function selectTeacherPastPapersOnEntry() {
    if (!isTeacher()) {
      teacherQuestionBankWasVisible = false;
      return;
    }
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
      .filter((node) => (node.textContent || '').trim().toLowerCase() === 'question bank');
    let questionBankRoot = null;
    for (const heading of headings) {
      let node = heading;
      for (let depth = 0; depth < 8 && node; depth += 1, node = node.parentElement) {
        if ((node.textContent || '').toLowerCase().includes('past papers')) {
          questionBankRoot = node;
          break;
        }
      }
      if (questionBankRoot) break;
    }
    if (!questionBankRoot) {
      teacherQuestionBankWasVisible = false;
      return;
    }
    const tabs = Array.from(questionBankRoot.querySelectorAll('button,[role="tab"]'));
    const pastPapersTab = tabs.find((tab) => (tab.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase() === 'past papers');
    if (!pastPapersTab || teacherQuestionBankWasVisible) return;
    teacherQuestionBankWasVisible = true;
    const selected = pastPapersTab.getAttribute('aria-selected') === 'true'
      || pastPapersTab.classList.contains('active')
      || pastPapersTab.classList.contains('selected');
    if (!selected) pastPapersTab.click();
  }

  function formatReleaseTimestamp(isoTimestamp) {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value || '';
    return `Released by Rishin on ${part('day')} ${part('month')} ${part('year')} at ${part('hour')}:${part('minute')}:${part('second')} IST`;
  }

  async function applyReleaseAttribution() {
    const target = document.getElementById('app-release-attribution');
    if (!target || target.dataset.releaseApplied === 'true') return;
    try {
      const response = await fetch('/release-info.json', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!response.ok) return;
      const release = await response.json();
      if (release.released_by !== 'Rishin') return;
      const stamp = formatReleaseTimestamp(release.released_at);
      if (!stamp) return;
      target.textContent = stamp;
      target.dataset.releaseApplied = 'true';
    } catch (error) {
      // Keep the source footer visible if release metadata cannot be loaded.
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) removePreviewLauncher(node);
      }
    }
    suppressTeacherDuplicateSummary(document);
    selectTeacherPastPapersOnEntry();
    applyReleaseAttribution();
  });

  function start() {
    removePreviewLauncher(document);
    suppressTeacherDuplicateSummary(document);
    selectTeacherPastPapersOnEntry();
    applyReleaseAttribution();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
