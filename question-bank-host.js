/* Question Bank module host bridge.
 * This is a preview-only integration. Existing Question Bank workflows remain in index.html.
 * No database methods are exposed until a workflow-specific, permission-checked API is added.
 */
(() => {
  'use strict';

  let activeFrame = null;
  let activeOverlay = null;
  let readyTimer = null;

  function canOpenQuestionBankModulePreview() {
    return window.isLoggedIn === true && window.currentRole === 'Admin';
  }

  function closeQuestionBankModulePreview() {
    if (readyTimer) window.clearTimeout(readyTimer);
    readyTimer = null;
    if (activeOverlay) activeOverlay.remove();
    activeOverlay = null;
    activeFrame = null;
    document.removeEventListener('keydown', onPreviewKeydown);
  }

  function onPreviewKeydown(event) {
    if (event.key === 'Escape') closeQuestionBankModulePreview();
  }

  function sendToModule(message) {
    if (!activeFrame || !activeFrame.contentWindow) return;
    activeFrame.contentWindow.postMessage(message, window.location.origin);
  }

  function handleModuleMessage(event) {
    if (!activeFrame || event.origin !== window.location.origin ||
        event.source !== activeFrame.contentWindow) return;

    const message = event.data;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

    if (message.type === 'LIB_QB_READY') {
      if (message.version !== 1) {
        sendToModule({ type: 'LIB_QB_HOST_CLOSED' });
        return;
      }
      if (!canOpenQuestionBankModulePreview()) {
        closeQuestionBankModulePreview();
        return;
      }
      if (readyTimer) window.clearTimeout(readyTimer);
      readyTimer = null;
      // Deliberately minimal: the preview needs only a display role. No IDs, tokens,
      // Supabase client, credentials, or application data cross the iframe boundary.
      sendToModule({
        type: 'LIB_QB_INIT',
        context: { role: 'Admin', mode: 'preview' }
      });
      return;
    }

    if (message.type === 'LIB_QB_CLOSE') {
      closeQuestionBankModulePreview();
      return;
    }

    if (message.type === 'LIB_QB_REQUEST') {
      const requestId = typeof message.requestId === 'string' &&
        /^qb-[0-9]{1,12}$/.test(message.requestId) ? message.requestId : null;
      if (!requestId) return;

      // No feature operations are enabled in the shell phase. In particular, never
      // proxy arbitrary table queries, RPC names, SQL, storage paths, or user-supplied methods.
      sendToModule({
        type: 'LIB_QB_RESPONSE',
        requestId,
        error: 'This Question Bank preview has no data operations enabled yet.'
      });
    }
  }

  function openQuestionBankModulePreview() {
    if (!canOpenQuestionBankModulePreview()) {
      window.alert('Only an authenticated Admin can open the Question Bank module preview.');
      return;
    }
    if (activeOverlay) closeQuestionBankModulePreview();

    const overlay = document.createElement('div');
    overlay.id = 'qbModulePreviewOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Question Bank module preview');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(10,18,34,.72);display:flex;flex-direction:column;padding:clamp(8px,2vw,24px);';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#fff;border-radius:12px 12px 0 0;font:600 14px system-ui,sans-serif;color:#172033;';
    const title = document.createElement('span');
    title.textContent = 'Question Bank · Module preview';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close preview';
    close.style.cssText = 'border:0;border-radius:8px;padding:9px 13px;background:#101d3a;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;';
    close.addEventListener('click', closeQuestionBankModulePreview);
    toolbar.append(title, close);

    const frame = document.createElement('iframe');
    frame.title = 'Question Bank module preview';
    frame.src = new URL('question-bank/question-bank.html', window.location.href).href;
    frame.referrerPolicy = 'same-origin';
    frame.style.cssText = 'display:block;flex:1;width:100%;min-height:0;border:0;background:#f3f5f9;border-radius:0 0 12px 12px;';
    frame.addEventListener('load', () => {
      if (!activeFrame || activeFrame !== frame) return;
      // The child sends LIB_QB_READY after its script starts. This timer only reports a
      // connection failure; it does not grant access or bypass the origin/source checks.
      readyTimer = window.setTimeout(() => {
        if (activeFrame === frame) {
          const note = document.createElement('div');
          note.textContent = 'The module did not complete its same-origin handshake. Close this preview and check the module files.';
          note.style.cssText = 'padding:10px 14px;background:#fff1ef;color:#8c2c20;font:13px system-ui,sans-serif;';
          overlay.insertBefore(note, frame);
        }
      }, 5000);
    });

    overlay.append(toolbar, frame);
    activeOverlay = overlay;
    activeFrame = frame;
    window.addEventListener('message', handleModuleMessage);
    document.addEventListener('keydown', onPreviewKeydown);
    document.body.appendChild(overlay);
    close.focus();
  }

  // Export only the preview launcher. The message listener is active only while the
  // preview iframe exists and is removed when the preview closes.
  window.openQuestionBankModulePreview = openQuestionBankModulePreview;
  const originalClose = closeQuestionBankModulePreview;
  closeQuestionBankModulePreview = function () {
    window.removeEventListener('message', handleModuleMessage);
    originalClose();
  };
})();
