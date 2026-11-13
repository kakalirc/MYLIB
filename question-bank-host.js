/* Production guard: the isolated Question Bank shell is not ready for user access.
 * Keep the module files available for development, but remove its temporary Admin
 * preview launcher from the live Question Bank tab. Existing Question Bank UI is untouched.
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

  // The Admin tab is rendered dynamically after login, so watch subsequent renders too.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) removePreviewLauncher(node);
      }
    }
  });

  function start() {
    removePreviewLauncher(document);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
