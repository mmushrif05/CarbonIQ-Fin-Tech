/* Not yet under `// @ts-check`, and on `docs/TYPECHECK-WORKLIST.md`.
   These errors are not new. This code was written inside an HTML file, where
   no checker ever looked at it — so the worklist grew when the file moved,
   not when the code did. What changed is that the gap is now counted.
   Almost all of it is one root cause: `document.getElementById` returns
   `HTMLElement | null`, and this file reads `.value` off the result. A file
   joins the check when its errors are fixed, never by adding the pragma, so
   that is its own change rather than something smuggled into the one that
   made the code reachable. */
/* ============================================================
   CarbonIQ — the sign-in screen's controller
   ui/js/login.js
   ============================================================
   Lifted out of `index.html`, where it was 213 lines of inline script.

   An inline `<script>` is covered by the same `'unsafe-inline'` on
   `script-src` that inline handlers needed, so the policy could not be
   tightened while this block sat in the page. Nothing about it changed in
   the move.

   Loaded before `actions.js` registers the allow-list, so `LoginPage` exists
   by the time a control on the sign-in screen can be pressed.
   ============================================================ */

'use strict';

const LoginPage = (() => {
  /* Sign-in is a request, not a decision the browser makes. Until H1 this
     form wrote a self-selected role into localStorage and every visitor was
     handed the same write-and-lock key; the role and the organisation now
     come back from the server, which is the only place that knows them. */
  async function submit() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!email || !password) {
      errEl.textContent = 'Enter your email address and password.';
      errEl.classList.add('visible');
      return;
    }
    errEl.classList.remove('visible');
    btn.disabled = true;

    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = body.message || 'Sign-in failed.';
        if (body.remedy) errEl.textContent += ` ${body.remedy}`;
        errEl.classList.add('visible');
        return;
      }
      Auth.startSession(body);
      /* A password an administrator typed reaches nothing but its own
         replacement — the server enforces that, and this form is where it
         gets replaced. Sending them to the dashboard instead would show a
         screen whose every request comes back 403. */
      if (body.user && body.user.mustChangePassword) return _showPane('change');
      _enter();
    } catch (err) {
      errEl.textContent = 'Could not reach the server. Check your connection and try again.';
      errEl.classList.add('visible');
    } finally {
      btn.disabled = false;
    }
  }

  /* One pane at a time. `hidden` is used rather than a class that sets
     `display`, because any class rule that sets display beats the
     user-agent sheet's [hidden] and the pane stays on screen.

     The preview offer is not one of these. It answers a different question
     from a different visitor, so it is a card of its own and its visibility
     is decided by `_applyPreview()` on every pane change — the two checks
     that run at load answer at their own speed, and while the offer was
     nested inside the sign-in card the later answer silently overrode the
     earlier one. */
  let _pane = 'signin';
  function _showPane(which) {
    _pane = which;
    const panes = { signin: 'login-card-signin', change: 'login-change', bootstrap: 'login-bootstrap' };
    Object.entries(panes).forEach(([name, id]) => {
      const el = document.getElementById(id);
      if (el) el.hidden = name !== which;
    });
    _applyPreview();
  }

  /* Whether the server said a preview session can be issued here. Held
     rather than read back off the panel, so a later pane change cannot lose
     the answer. */
  let _previewOffered = false;

  /**
   * Show the offer where it makes sense, from both facts at once.
   *
   * Not on the change-password pane: that person is part-way through taking
   * ownership of their own account, and opening the sample book from there
   * would replace the session they are holding.
   */
  function _applyPreview() {
    const el = document.getElementById('login-preview');
    if (el) el.hidden = !(_previewOffered && _pane !== 'change');
  }

  function _enter() {
    Auth.enforceAuth();
    const defaultPage = Auth.getDefaultPage();
    if (typeof window.CARBONIQ_navigateTo === 'function') {
      window.CARBONIQ_navigateTo(defaultPage);
    } else {
      const navItem = document.querySelector(`.nav-item[data-page="${defaultPage}"]`);
      if (navItem) navItem.click();
    }
  }

  function _say(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('visible', Boolean(text));
  }

  /** Replace the administrator's password with the account holder's own. */
  async function changePassword() {
    const next = document.getElementById('change-new').value;
    const again = document.getElementById('change-again').value;
    if (next !== again) return _say('change-error', 'The two passwords are not the same.');
    if (!next || next.length < 12) return _say('change-error', 'Use at least 12 characters.');
    _say('change-error', '');
    const btn = document.getElementById('change-btn');
    btn.disabled = true;
    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Auth.getToken()}` },
        /* The current password is the one just used to sign in, which is
           why this form asks for it once rather than twice. */
        body: JSON.stringify({
          currentPassword: document.getElementById('login-password').value,
          newPassword: next,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return _say('change-error', [body.message, body.remedy].filter(Boolean).join(' '));
      /* Changing a password ends every other session and issues a fresh one
         here, so the token in hand has to be replaced with the new one. */
      Auth.startSession({ token: body.token, expiresAt: body.expiresAt,
        user: { ...Auth.getSession(), id: Auth.getSession().userId, orgId: Auth.getSession().organisation,
          mustChangePassword: false } });
      _enter();
    } catch (_) {
      _say('change-error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      btn.disabled = false;
    }
  }

  /** Create the first administrator, where the server says that is still possible. */
  async function bootstrap() {
    const payload = {
      token: document.getElementById('boot-token').value,
      orgId: document.getElementById('boot-org').value.trim(),
      email: document.getElementById('boot-email').value.trim(),
      password: document.getElementById('boot-password').value,
    };
    if (!payload.token || !payload.orgId || !payload.email || !payload.password) {
      return _say('boot-error', 'Every field is required.');
    }
    _say('boot-error', '');
    const btn = document.getElementById('boot-btn');
    btn.disabled = true;
    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/bootstrap`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return _say('boot-error', [body.message, body.remedy].filter(Boolean).join(' '));
      _showPane('signin');
      document.getElementById('login-email').value = payload.email;
      _say('login-error', '');
    } catch (_) {
      _say('boot-error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      btn.disabled = false;
    }
  }

  /** Open the sample book against an address, and nothing else. */
  async function preview() {
    const email = document.getElementById('preview-email').value.trim();
    if (!email) return _say('preview-error', 'Enter an email address.');
    _say('preview-error', '');
    const btn = document.getElementById('preview-btn');
    btn.disabled = true;
    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return _say('preview-error', [body.message, body.remedy].filter(Boolean).join(' '));
      Auth.startSession(body);
      _enter();
    } catch (_) {
      _say('preview-error', 'Could not reach the server. Check your connection and try again.');
    } finally {
      btn.disabled = false;
    }
  }

  /* Asked before the panel is drawn, for the same reason the first-run
     window is: a deployment that cannot issue a preview session should show
     no offer rather than one that fails when pressed. */
  async function _checkPreview() {
    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/preview`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.available) _previewOffered = true;
      _applyPreview();
    } catch (_) { /* offline: offer nothing */ }
  }

  /* The window is checked before the form is drawn, so an operator setting
     a deployment up meets the first-run screen rather than a sign-in form
     that can only refuse them. */
  async function _checkFirstRun() {
    try {
      const res = await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/bootstrap`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.available) _showPane('bootstrap');
    } catch (_) { /* offline: the sign-in form is the right thing to show */ }
  }

  /* Enter submits, which is what a two-field sign-in form should do. */
  function _wireEnter() {
    ['login-email', 'login-password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    });
    ['change-new', 'change-again'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') changePassword(); });
    });
    const pv = document.getElementById('preview-email');
    if (pv) pv.addEventListener('keydown', e => { if (e.key === 'Enter') preview(); });
    _checkFirstRun();
    _checkPreview();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wireEnter);
  } else {
    _wireEnter();
  }

  return { submit, changePassword, bootstrap, preview };
})();
