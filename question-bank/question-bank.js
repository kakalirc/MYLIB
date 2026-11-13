(() => {
  "use strict";
  // The module is hosted by My LIB. Authentication and data access stay in the host.
  const status = document.getElementById("qb-status");
  const workspace = document.getElementById("qb-workspace");
  const roleLabel = document.getElementById("qb-role");
  const closeButton = document.getElementById("qb-close");
  const pending = new Map();
  let requestSequence = 0;
  let hostReady = false;

  function showConnectionError(title, message) {
    status.classList.remove("hidden");
    status.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = title;
    const detail = document.createElement("p"); detail.textContent = message;
    status.append(heading, detail);
    workspace.classList.add("hidden"); roleLabel.textContent = "NOT CONNECTED";
  }

  function requestHost(method, payload = {}) {
    if (!hostReady || window.parent === window) return Promise.reject(new Error("Question Bank must be opened from My LIB."));
    const requestId = "qb-" + (++requestSequence);
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { pending.delete(requestId); reject(new Error("My LIB did not respond to the request.")); }, 15000);
      pending.set(requestId, { resolve, reject, timeout });
      window.parent.postMessage({ type: "LIB_QB_REQUEST", requestId, method, payload }, window.location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "LIB_QB_INIT") {
      hostReady = true;
      const context = message.context || {};
      roleLabel.textContent = String(context.role || "SIGNED IN").toUpperCase();
      status.classList.add("hidden"); workspace.classList.remove("hidden");
      return;
    }
    if (message.type === "LIB_QB_RESPONSE" && typeof message.requestId === "string") {
      const item = pending.get(message.requestId); if (!item) return;
      window.clearTimeout(item.timeout); pending.delete(message.requestId);
      if (message.error) item.reject(new Error(String(message.error))); else item.resolve(message.result);
    }
    if (message.type === "LIB_QB_HOST_CLOSED") showConnectionError("My LIB connection closed", "Return to My LIB and open Question Bank again.");
  });

  closeButton.addEventListener("click", () => {
    if (window.parent !== window) window.parent.postMessage({ type: "LIB_QB_CLOSE" }, window.location.origin);
    else window.location.href = "../";
  });

  if (window.parent !== window) {
    window.parent.postMessage({ type: "LIB_QB_READY", version: 1 }, window.location.origin);
    window.setTimeout(() => { if (!hostReady) showConnectionError("Waiting for My LIB", "The host integration is not installed yet. Existing Question Bank screens continue to work in My LIB."); }, 1800);
  } else showConnectionError("Open from My LIB", "This module is not a standalone login page. Open it through the authenticated My LIB application.");

  // Narrow host bridge only. Feature-specific methods are added during migration.
  window.LIBQuestionBankModule = Object.freeze({ requestHost });
})();
