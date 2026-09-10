/* ============================================================
   CarbonIQ — Accounts

   Who can sign in, under which role, and until when.

   Three facts about an account, kept apart on the screen because
   they are three questions with three answers:

     the role      what they may do
     the standing  whether an administrator switched them off
     the window    whether a date agreed in advance has passed

   A customer told "your account has been disabled" when their
   trial simply ran out calls the wrong person and hears the
   wrong answer, so the two never share a column.

   Two mechanical rules this codebase has shipped wrong before:
   a password shown once is rendered where it can be read and
   never re-fetched, and anything that changes what the first
   request says is wired before that request is sent.
   ============================================================ */

const AccountsPage = (() => {

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const day = s => (s ? String(s).slice(0, 10) : '—');

  const state = { users: [], roles: [], loaded: false };

  /* The six roles, in the order they descend. Held here rather than fetched
     because the sign-in response already names the caller's, and a select
     that cannot be drawn until a request returns is a select that flickers. */
  const ROLES = [
    { id: 'admin', label: 'Administrator' },
    { id: 'credit_officer', label: 'Credit Officer' },
    { id: 'esg_analyst', label: 'ESG Analyst' },
    { id: 'relationship_manager', label: 'Relationship Manager' },
    { id: 'auditor', label: 'Auditor' },
    { id: 'borrower', label: 'Borrower' },
  ];

  async function call(path, opts) {
    const res = await window.CARBONIQ_fetch('/v1/auth' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok) {
      throw new Error([data.message, data.remedy].filter(Boolean).join(' ')
        || `Request failed (${res.status})`);
    }
    return data;
  }

  function say(id, text, bad) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('bad', Boolean(bad));
    el.hidden = !text;
  }

  /* ── The window, in words ───────────────────────────────── */

  function windowCell(u) {
    const a = u.access || {};
    if (a.state === 'ended') {
      return `<span class="ac-pill past">Ended ${esc(day(a.endsAt))}</span>`;
    }
    if (a.state === 'ending') {
      const soon = Number(a.daysRemaining) <= 7;
      return `<span class="ac-pill ${soon ? 'warn' : 'trial'}">Until ${esc(day(a.endsAt))}</span>`
        + `<div class="ac-sub">${esc(a.daysRemaining)} day${a.daysRemaining === 1 ? '' : 's'} remaining</div>`;
    }
    if (a.state === 'disabled' && a.endsAt) {
      return `<span class="ac-pill past">Until ${esc(day(a.endsAt))}</span>`;
    }
    return '<span class="ac-sub">No end date</span>';
  }

  function standingCell(u) {
    if (u.active === false) return '<span class="ac-pill past">Disabled</span>';
    if (u.mustChangePassword) {
      return '<span class="ac-pill warn">Password not yet set</span>'
        + '<div class="ac-sub">Can reach its own password and nothing else.</div>';
    }
    return '<span class="ac-pill live">Active</span>';
  }

  /* ── Rows ───────────────────────────────────────────────── */

  function rowHtml(u) {
    const ended = (u.access || {}).state === 'ended';
    return `
      <tr class="${u.active === false || ended ? 'off' : ''}">
        <td>
          <div class="ac-email">${esc(u.email)}</div>
          ${u.name && u.name !== u.email ? `<div class="ac-sub">${esc(u.name)}</div>` : ''}
        </td>
        <td>
          <select class="ac-btn" data-role-for="${esc(u.id)}">
            ${ROLES.map(r => `<option value="${r.id}"${r.id === u.role ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select>
        </td>
        <td>${standingCell(u)}</td>
        <td>${windowCell(u)}</td>
        <td class="ac-sub">${u.lastLoginAt ? esc(day(u.lastLoginAt)) : 'Never'}</td>
        <td>
          <div class="ac-row-actions">
            <input type="date" class="ac-btn" data-until-for="${esc(u.id)}"
                   value="${esc(day(u.accessEndsAt) === '—' ? '' : day(u.accessEndsAt))}" />
            <button class="ac-btn" data-act="window" data-id="${esc(u.id)}">Set</button>
            ${u.accessEndsAt ? `<button class="ac-btn" data-act="open" data-id="${esc(u.id)}">No end</button>` : ''}
            ${!ended && u.accessEndsAt ? `<button class="ac-btn" data-act="endnow" data-id="${esc(u.id)}">End now</button>` : ''}
            <button class="ac-btn" data-act="${u.active === false ? 'enable' : 'disable'}" data-id="${esc(u.id)}">
              ${u.active === false ? 'Enable' : 'Disable'}
            </button>
            <button class="ac-btn" data-act="reset" data-id="${esc(u.id)}">Reset password</button>
          </div>
        </td>
      </tr>`;
  }

  function summaryHtml() {
    const all = state.users;
    const admins = all.filter(u => u.role === 'admin' && u.active !== false).length;
    const trials = all.filter(u => (u.access || {}).state === 'ending').length;
    const ended = all.filter(u => (u.access || {}).state === 'ended').length;
    const cards = [
      { label: 'Accounts', value: all.length, note: `${all.filter(u => u.active !== false).length} active` },
      { label: 'Administrators', value: admins,
        note: admins === 0 ? 'This deployment has no administrator.' : 'Can issue and end access.' },
      { label: 'Trials running', value: trials, note: trials ? 'Access ends on a recorded date.' : 'No account has an end date.' },
      { label: 'Access ended', value: ended, note: ended ? 'Signed out, and refused at sign-in.' : 'None.' },
    ];
    return cards.map(c => `
      <div class="ac-card">
        <p class="ac-h">${esc(c.label)}</p>
        <p class="ac-v">${esc(c.value)}</p>
        <p class="ac-u">${esc(c.note)}</p>
      </div>`).join('');
  }

  function render() {
    $('ac-summary').innerHTML = summaryHtml();
    const rows = state.users.slice().sort((a, b) => String(a.email).localeCompare(String(b.email)));
    $('ac-rows').innerHTML = rows.map(rowHtml).join('');
    $('ac-empty').hidden = rows.length > 0;
  }

  /* ── Actions ────────────────────────────────────────────── */

  async function patch(id, body) {
    say('ac-msg', '');
    try {
      await call(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (err) {
      say('ac-msg', err.message, true);
    }
  }

  /* A password is generated in the browser only so it can be shown once here;
     the server stores a hash of it and can never read it back, which is why
     it is rendered rather than promised in an email nobody sends. */
  function newPassword() {
    const bytes = new Uint8Array(18);
    (window.crypto || {}).getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 20) + 'a7';
  }

  async function onAction(act, id) {
    const untilEl = document.querySelector(`[data-until-for="${id}"]`);
    if (act === 'window') {
      const value = untilEl && untilEl.value;
      if (!value) return say('ac-msg', 'Choose a date first, or use "No end".', true);
      return patch(id, { accessEndsAt: value });
    }
    if (act === 'open') return patch(id, { accessEndsAt: null });
    if (act === 'endnow') return patch(id, { accessEndsAt: new Date().toISOString() });
    if (act === 'disable') return patch(id, { active: false });
    if (act === 'enable') return patch(id, { active: true });
    if (act === 'reset') {
      const secret = newPassword();
      say('ac-msg', '');
      try {
        await call(`/users/${encodeURIComponent(id)}/password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: secret, mustChangePassword: true }),
        });
        say('ac-msg', `New password: ${secret} — shown once. Every session that account held has ended.`);
        await refresh();
      } catch (err) {
        say('ac-msg', err.message, true);
      }
    }
  }

  async function create() {
    const email = $('ac-email').value.trim();
    const name = $('ac-name').value.trim();
    const role = $('ac-role').value;
    const until = $('ac-until').value;
    $('ac-secret').hidden = true;
    say('ac-create-msg', '');
    if (!email) return say('ac-create-msg', 'An email address is required.', true);

    const secret = newPassword();
    try {
      const { user } = await call('/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, name: name || undefined, role, password: secret,
          accessEndsAt: until || undefined, mustChangePassword: true,
        }),
      });
      const el = $('ac-secret');
      el.textContent = `${user.email} · ${secret}`;
      el.hidden = false;
      say('ac-create-msg', 'Shown once. Give it to them over a channel you trust; '
        + 'they must replace it before they can reach anything else.');
      $('ac-email').value = '';
      $('ac-name').value = '';
      $('ac-until').value = '';
      await refresh();
    } catch (err) {
      say('ac-create-msg', err.message, true);
    }
  }

  /* ── Load ───────────────────────────────────────────────── */

  async function refresh() {
    try {
      const { users } = await call('/users');
      state.users = users || [];
      state.loaded = true;
      render();
    } catch (err) {
      say('ac-msg', err.message, true);
    }
  }

  function init() {
    /* Wired before the first request, so an action taken on a row that has
       just arrived is not lost to a listener that was attached afterwards. */
    $('ac-role').innerHTML = ROLES.map(r =>
      `<option value="${r.id}"${r.id === 'esg_analyst' ? ' selected' : ''}>${esc(r.label)}</option>`).join('');
    $('ac-create').addEventListener('click', create);
    $('ac-rows').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) onAction(btn.dataset.act, btn.dataset.id);
    });
    $('ac-rows').addEventListener('change', (e) => {
      const sel = e.target.closest('[data-role-for]');
      if (sel) patch(sel.dataset.roleFor, { role: sel.value });
    });
    refresh();
  }

  return { init, refresh };
})();
