/* Production UI guard and deployment release attribution.
 * The unfinished Question Bank shell remains available for development, but its
 * temporary Admin preview launcher is hidden. Teacher-only Question Bank fixes
 * are applied here without changing Admin duplicate-review behaviour.
 */
(() => {
  'use strict';

  const PREVIEW_LABEL = 'Preview new Question Bank module';
  const DUPLICATE_SUMMARY_TITLE = 'possible duplicate papers grouped together';
  const DUPLICATE_SUMMARY_EXPLANATION = 'papers with matching details are candidates for comparison';

  function isTeacher() {
    return typeof currentRole !== 'undefined' && String(currentRole).toLowerCase() === 'teacher';
  }

  function normaliseText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

    // Do not depend on the heading being a particular HTML tag. The live Question
    // Bank renders this notice through generated markup, which can vary by view.
    const candidates = Array.from(root.querySelectorAll('h1,h2,h3,h4,strong,b,[role="heading"],div,p,section,article'));
    candidates.forEach((heading) => {
      if (normaliseText(heading.textContent) !== DUPLICATE_SUMMARY_TITLE) return;

      let target = heading;
      for (let depth = 0; depth < 9 && target.parentElement; depth += 1) {
        target = target.parentElement;
        const content = normaliseText(target.textContent);
        if (content.includes(DUPLICATE_SUMMARY_EXPLANATION) && content.length < 1800) {
          target.style.setProperty('display', 'none', 'important');
          target.setAttribute('aria-hidden', 'true');
          break;
        }
      }
    });
  }

  function collapseAdminDuplicateSummary(root) {
    if (isTeacher() || !root || typeof root.querySelectorAll !== 'function') return;

    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,strong,b,[role="heading"]'));
    const rows = Array.from(root.querySelectorAll('div,p,li,section,article,span'))
      .filter((element) => /^\d+\s+papers grouped for comparison\s*:/i.test(
        String(element.textContent || '').trim()
      ))
      .filter((element) => !Array.from(element.children || []).some((child) =>
        /^\d+\s+papers grouped for comparison\s*:/i.test(String(child.textContent || '').trim())
      ));

    headings.forEach((heading) => {
      if (!normaliseText(heading.textContent).startsWith(DUPLICATE_SUMMARY_TITLE)) return;

      let toggle = heading.querySelector('.qb-duplicate-groups-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'qb-duplicate-groups-toggle';
        toggle.textContent = 'Show duplicate groups';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.style.cssText = 'margin-left:10px;padding:4px 9px;border:1px solid var(--border,#d1d5db);border-radius:7px;background:transparent;color:inherit;font:inherit;font-size:12px;font-weight:600;cursor:pointer;';
        heading.appendChild(toggle);
        heading.dataset.duplicateGroupsCollapsed = 'true';

        toggle.addEventListener('click', () => {
          const collapsed = heading.dataset.duplicateGroupsCollapsed !== 'false';
          const nextCollapsed = !collapsed;
          heading.dataset.duplicateGroupsCollapsed = String(nextCollapsed);
          const currentRows = Array.from(document.querySelectorAll('div,p,li,section,article,span'))
            .filter((element) => /^\d+\s+papers grouped for comparison\s*:/i.test(
              String(element.textContent || '').trim()
            ))
            .filter((element) => !Array.from(element.children || []).some((child) =>
              /^\d+\s+papers grouped for comparison\s*:/i.test(String(child.textContent || '').trim())
            ));
          currentRows.forEach((row) => { row.hidden = nextCollapsed; });
          toggle.textContent = nextCollapsed ? 'Show duplicate groups' : 'Hide duplicate groups';
          toggle.setAttribute('aria-expanded', String(!nextCollapsed));
        });
      }

      const collapsed = heading.dataset.duplicateGroupsCollapsed !== 'false';
      rows.forEach((row) => { row.hidden = collapsed; });
      toggle.textContent = collapsed ? 'Show duplicate groups' : 'Hide duplicate groups';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  let teacherQuestionBankWasVisible = false;

  function isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden'
      && element.getClientRects().length > 0;
  }

  function findTeacherQuestionBank() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
      .filter((node) => normaliseText(node.textContent) === 'question bank');

    for (const heading of headings) {
      let node = heading;
      for (let depth = 0; depth < 9 && node; depth += 1, node = node.parentElement) {
        if (!isElementVisible(node)) continue;
        const tabs = Array.from(node.querySelectorAll('button,[role="tab"]'));
        const pastPapersTab = tabs.find((tab) =>
          normaliseText(tab.textContent) === 'past papers'
        );
        if (pastPapersTab) return { root: node, tabs, pastPapersTab };
      }
    }
    return null;
  }

  function selectTeacherPastPapersOnEntry() {
    if (!isTeacher()) {
      teacherQuestionBankWasVisible = false;
      return;
    }

    const questionBank = findTeacherQuestionBank();
    if (!questionBank) {
      teacherQuestionBankWasVisible = false;
      return;
    }

    // Only choose the default when entering the Question Bank. Do not override a
    // teacher's subsequent manual tab selection while they remain in this view.
    if (teacherQuestionBankWasVisible) return;
    const { pastPapersTab } = questionBank;
    const selected = pastPapersTab.getAttribute('aria-selected') === 'true'
      || pastPapersTab.classList.contains('active')
      || pastPapersTab.classList.contains('selected');
    teacherQuestionBankWasVisible = true;
    if (!selected) pastPapersTab.click();
  }


  function filenameFromStoredPath(value) {
    const raw = String(value || '').split('?')[0].split('/').pop() || '';
    let name = raw;
    try { name = decodeURIComponent(raw); } catch (_) {}
    name = name.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return '';
    name = name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    return name;
  }

  let sourcePaperTitleLookup = null;
  async function applySourcePaperFilenames(root) {
    if (typeof qbSourcePapers === 'undefined' || !Array.isArray(qbSourcePapers)) return;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const buttons = Array.from(root.querySelectorAll('button[onclick*="qbPrepareSourcePaperExtraction"]'));
    const visibleIds = [...new Set(buttons.map((button) => {
      const match = String(button.getAttribute('onclick') || '').match(/qbPrepareSourcePaperExtraction\(['"]([^'"]+)['"]\)/);
      return match ? match[1] : '';
    }).filter(Boolean))];
    if (!visibleIds.length) return;

    // Discovery downloads are stored under random UUID.pdf names. Their real
    // document names live on the discovery candidate row, keyed by imported_paper_id.
    if (!sourcePaperTitleLookup && typeof sb !== 'undefined' && sb && typeof sb.from === 'function') {
      const ids = qbSourcePapers.map((paper) => String(paper.id)).filter(Boolean);
      sourcePaperTitleLookup = sb.from('qb_paper_discovery_candidates')
        .select('imported_paper_id,title')
        .in('imported_paper_id', ids)
        .then(({ data, error }) => {
          if (error) throw error;
          return new Map((data || []).map((candidate) => [
            String(candidate.imported_paper_id),
            String(candidate.title || '').trim()
          ]));
        })
        .catch(() => new Map());
    }
    const discoveryTitles = sourcePaperTitleLookup ? await sourcePaperTitleLookup : new Map();
    const byId = new Map(qbSourcePapers.map((paper) => {
      const id = String(paper.id);
      const storedName = filenameFromStoredPath(paper.stored_pdf_url);
      const discoveryName = discoveryTitles.get(id) || '';
      const name = discoveryName || storedName;
      return [id, {
        name: name && !/^[0-9a-f-]{32,}$/i.test(name) ? name : '',
        subject: String(paper.subject_name || 'Question Paper'),
        year: String(paper.year || '')
      }];
    }));

    buttons.forEach((button) => {
      const match = String(button.getAttribute('onclick') || '').match(/qbPrepareSourcePaperExtraction\(['"]([^'"]+)['"]\)/);
      if (!match) return;
      const paper = byId.get(match[1]);
      if (!paper) return;
      const row = button.parentElement && button.parentElement.parentElement;
      const heading = row && row.querySelector('b');
      if (!heading || !/^Paper\s+\d+\s*[·.-]/i.test(heading.textContent || '')) return;
      const label = [paper.name || paper.subject, paper.year].filter(Boolean).join(' · ');
      if (label && heading.textContent !== label) heading.textContent = label;
    });
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
    collapseAdminDuplicateSummary(document);
    selectTeacherPastPapersOnEntry();
    applySourcePaperFilenames(document);
    applyReleaseAttribution();
  });

  function start() {
    removePreviewLauncher(document);
    suppressTeacherDuplicateSummary(document);
    collapseAdminDuplicateSummary(document);
    selectTeacherPastPapersOnEntry();
    applySourcePaperFilenames(document);
    applyReleaseAttribution();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
