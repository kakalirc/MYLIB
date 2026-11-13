/* Production UI guard and release attribution.
 * The unfinished Question Bank shell remains available for development, but its
 * temporary Admin preview launcher is hidden. Existing Question Bank workflows
 * are not changed by this file.
 */
(() => {
  'use strict';

  const PREVIEW_LABEL = 'Preview new Question Bank module';

  function removePreviewLauncher(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('button').forEach((button) => {
      if ((button.textContent || '').trim() !== PREVIEW_LABEL) return;
      const wrapper = button.parentElement;
      if (wrapper && wrapper.children.length === 1 && wrapper.tagName === 'DIV') {
        wrapper.remove();
      } else {
        button.remove();
      }
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
    try {
      const response = await fetch('/release-info.json?release=' + Date.now(), {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!response.ok) return;
      const release = await response.json();
      if (release.released_by !== 'Rishin') return;
      const stamp = formatReleaseTimestamp(release.released_at);
      if (!stamp || !document.body) return;

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/Version\s+\S+.*Build\s+/i.test(node.nodeValue || '')) {
          node.nodeValue = stamp;
        }
      }
    } catch (error) {
      // Keep the existing footer intact if release metadata is temporarily unavailable.
    }
  }

  // Login and Admin content can render dynamically; retain the targeted UI guard.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) removePreviewLauncher(node);
      }
    }
    applyReleaseAttribution();
  });

  function start() {
    removePreviewLauncher(document);
    applyReleaseAttribution();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
