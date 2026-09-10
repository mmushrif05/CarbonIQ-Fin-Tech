/* ============================================================
   CarbonIQ — Global API Configuration
   ============================================================
   Every page module reaches the API through window.CARBONIQ_fetch,
   which carries the session token the server issued at sign-in.

   Loaded FIRST in index.html, before app.js or any page module.

   The browser holds no API key. It used to be handed one — the same
   key for every visitor, carrying read, write, lock and assess under a
   single organisation — and the name on the audit trail was whatever
   had been typed into the sign-in form. A session token is issued to
   one account, carries that account's role, and can be withdrawn.
   ============================================================ */

(function () {
  const DEFAULTS = { apiBase: '' };   // relative to the current origin

  const stored = JSON.parse(localStorage.getItem('carboniq_config') || '{}');
  window.CARBONIQ_API_BASE = stored.apiBase ?? DEFAULTS.apiBase;

  window.CARBONIQ_saveConfig = function (apiBase) {
    const cfg = { apiBase: apiBase || '' };
    localStorage.setItem('carboniq_config', JSON.stringify(cfg));
    window.CARBONIQ_API_BASE = cfg.apiBase;
  };

  /* Read at call time, not at load: a page module may be loaded before
     anyone has signed in, and the token changes when they do. */
  function authHeader() {
    try {
      const s = JSON.parse(localStorage.getItem('carboniq_session') || 'null');
      return s && s.token ? { Authorization: `Bearer ${s.token}` } : {};
    } catch (_) { return {}; }
  }

  window.CARBONIQ_fetch = async function (path, opts = {}) {
    const url = `${window.CARBONIQ_API_BASE}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(authHeader()),
      ...(opts.headers || {}),
    };
    const res = await fetch(url, { ...opts, headers });

    /* A session the server has ended — expired, idle, revoked, or the
       account disabled — must not leave the shell showing a signed-in
       screen that answers 401 to everything it asks. */
    if (res.status === 401 && typeof Auth !== 'undefined' && Auth.getToken()) {
      Auth.sessionEnded();
    }
    return res;
  };
})();

/* ============================================================
   Toast Notification System
   ============================================================ */
const Toast = (() => {
  function show(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  /* `show` is public because seven call sites across the PCAF Part C and
     Insurance Book screens use it directly — every one of their validation
     warnings. Exposing only the three named helpers meant those calls threw
     "Toast.show is not a function", which killed the handler mid-way: clicking
     Run assessment with no project GIA produced no warning, no toast and no
     run, and nothing on screen said why.

     `warn` is here because those calls ask for it by name. Without it the
     class landed as `toast-warn` with no rule to match, so the message would
     have rendered unstyled even once it stopped throwing. */
  return {
    show,
    success: (msg, d) => show(msg, 'success', d),
    error:   (msg, d) => show(msg, 'error',   d),
    warn:    (msg, d) => show(msg, 'warn',    d),
    info:    (msg, d) => show(msg, 'info',    d),
  };
})();

/* ============================================================
   Settings Panel
   ============================================================ */
const Settings = (() => {
  function open() {
    const drawer = document.getElementById('settings-drawer');
    if (!drawer) return;
    const baseEl = document.getElementById('cfg-api-base');
    if (baseEl) baseEl.value = window.CARBONIQ_API_BASE || '';
    drawer.style.display = 'block';
  }

  function close() {
    const drawer = document.getElementById('settings-drawer');
    if (drawer) drawer.style.display = 'none';
  }

  function save() {
    const base = document.getElementById('cfg-api-base')?.value?.trim() || '';
    window.CARBONIQ_saveConfig(base);
    const msg = document.getElementById('cfg-msg');
    if (msg) { msg.textContent = 'Saved.'; msg.style.color = 'var(--green)'; }
    Toast.success('API settings saved. Data will refresh on next navigation.');
    setTimeout(close, 1200);
  }

  function reset() {
    /* Reset means "stop overriding", not "write a default back". There is no
       credential here to restore: the browser holds a session token issued at
       sign-in, and the only thing this drawer can override is where the API
       lives. */
    localStorage.removeItem('carboniq_config');
    window.CARBONIQ_API_BASE = '';
    const baseEl = document.getElementById('cfg-api-base');
    if (baseEl) baseEl.value = '';
    const msg = document.getElementById('cfg-msg');
    if (msg) {
      msg.textContent = 'Reset — using this origin.';
      msg.style.color = 'var(--text-secondary)';
    }
  }

  return { open, close, save, reset };
})();
