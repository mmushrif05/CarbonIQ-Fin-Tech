// @ts-check
/* ============================================================
   CarbonIQ — Stakeholder Authentication & RBAC Module
   ui/js/auth.js
   ============================================================
   Holds the session token the server issued at sign-in, and hides the
   pages a role cannot use. Mirrors src/shared/policies.js.

   Hiding a page is a courtesy, not a control: the server decides what any
   request may do from the role on the account behind the token, so a page
   reached anyway simply answers 403.

   Loaded AFTER config.js and BEFORE app.js in index.html.
   ============================================================ */

const Auth = (() => {
  'use strict';

  // ── Role definitions (mirrors config/policies.js) ──────────
  const ROLES = {
    admin: {
      label: 'Bank Administrator',
      level: 100,
      description: 'Full platform control — user management, API keys, all agent operations',
      avatar: '#8b5cf6',
    },
    credit_officer: {
      label: 'Credit Officer',
      level: 80,
      description: 'Loan origination, covenant approval, monitoring',
      avatar: '#3b82f6',
    },
    esg_analyst: {
      label: 'ESG Analyst',
      level: 60,
      description: 'Carbon assessment, taxonomy, PCAF, portfolio analysis',
      avatar: '#10b981',
    },
    relationship_manager: {
      label: 'Relationship Manager',
      level: 40,
      description: 'Client-facing — screening, coaching, read-only assessments',
      avatar: '#f59e0b',
    },
    auditor: {
      label: 'Auditor',
      level: 30,
      description: 'Read-only access to all runs, reports, and audit trails',
      avatar: '#6366f1',
    },
    viewer: {
      label: 'Preview visitor',
      level: 20,
      description: 'Read-only access to the sample book',
      avatar: '#64748b',
    },
    borrower: {
      label: 'Borrower',
      level: 10,
      description: 'Self-service coaching and application status visibility',
      avatar: '#ec4899',
    },
  };

  // ── Page access matrix ─────────────────────────────────────
  // Maps each page to the minimum role level required.
  // Pages not listed are accessible to all authenticated users.
  const PAGE_ACCESS = {
    'dashboard':      10,   // everyone
    'portfolio':      30,   // auditor+
    'ai-agents':      10,   // everyone (agent-level filtering done server-side)
    'ai-extract':     40,   // relationship_manager+
    'new-project':    40,   // relationship_manager+
    'pcaf':           60,   // esg_analyst+
    'pcaf-parta':     60,   // esg_analyst+ — same bar as the other PCAF screens
    'monitoring':     60,   // esg_analyst+
    'pipeline':       60,   // esg_analyst+
    'carbon-pricing': 40,   // relationship_manager+
    'reports':        30,   // auditor+
    'taxonomy':       30,   // auditor+
    /* Administrators only. The nav entry is hidden below this level and every
       route behind the screen requires the `admin` scope, so hiding it is a
       courtesy rather than the control. */
    'accounts':      100,
  };

  /*
   * What a preview visitor is shown, named rather than derived from a level.
   *
   * The matrix above answers "is this person senior enough to do the work on
   * this screen", and for a read-only visitor that is the wrong question: the
   * PCAF screens sit at 60 because an analyst runs assessments on them, not
   * because reading one is privileged. Bending the visitor's level up to
   * clear those bars would also clear every other bar set at or below it.
   *
   * So a preview session is answered from its own list. This is a courtesy
   * either way — the server decides what any request may do from the role on
   * the account, and a preview session holds `read` — but the courtesy should
   * show the product rather than a sidebar of screens that answer 403.
   */
  const PREVIEW_PAGES = [
    'dashboard', 'desk', 'portfolio', 'pcaf', 'pcaf-parta', 'pcaf-partc',
    'partc-book', 'partc-portfolio', 'gcf', 'taxonomy', 'ndc-sdg',
    'reports', 'carbon-pricing', 'baselines',
  ];

  const STORAGE_KEY = 'carboniq_session';

  // ── Session management ─────────────────────────────────────
  function _getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === null ? null : JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function _saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function _clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isLoggedIn() {
    const session = _getSession();
    return Boolean(session && session.token && session.role && ROLES[session.role]);
  }

  function getSession() {
    return _getSession();
  }

  function getRole() {
    const session = _getSession();
    return session ? ROLES[session.role] : null;
  }

  function getRoleKey() {
    const session = _getSession();
    return session ? session.role : null;
  }

  // ── Sign in ────────────────────────────────────────────────
  /**
   * Record what POST /v1/auth/login returned. The role and the organisation
   * come from the server; nothing here decides them.
   */
  function startSession({ token, expiresAt, user }) {
    if (!token || !user) return false;
    const label = user.name || user.email || '';
    const initials = label.split(/[\s@.]+/).filter(Boolean)
      .map(w => w[0]).join('').toUpperCase().slice(0, 2);
    _saveSession({
      token,
      expiresAt: expiresAt || null,
      userId: user.id,
      name: label,
      email: user.email,
      role: user.role,
      organisation: user.orgId || '',
      initials,
      loginTime: new Date().toISOString(),
      /* Two facts about the account that the shell has to act on rather than
         only display: a password an administrator issued reaches nothing but
         its own replacement, and an access window that is running out is
         something the holder should see before the day it closes. */
      mustChangePassword: user.mustChangePassword === true,
      accessEndsAt: (user.access && user.access.endsAt) || user.accessEndsAt || null,
      accessDaysRemaining: (user.access && user.access.daysRemaining) ?? null,
    });
    return true;
  }

  /**
   * Whether this session is a preview of the sample book.
   *
   * Read from the role the server put on the session rather than from a flag
   * the browser was handed, so it survives a reload and cannot drift from what
   * the server will actually allow.
   */
  function isPreview() {
    const session = _getSession();
    return Boolean(session && session.role === 'viewer');
  }

  /**
   * Say so, on every screen, for as long as the session lasts.
   *
   * A visitor who forgets which book they are looking at is the failure this
   * guards against — the figures are real arithmetic over invented policies,
   * which is exactly the combination that reads as somebody's real position.
   * It is a provenance label rather than a warning, so it is neutral: amber is
   * for something the reader has to act on.
   */
  function applyPreviewMark() {
    const main = document.getElementById('main');
    if (!main) return;
    const existing = document.getElementById('preview-mark');
    if (!isPreview()) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const strip = document.createElement('div');
    strip.id = 'preview-mark';
    strip.className = 'preview-mark';
    strip.setAttribute('role', 'status');
    strip.textContent = 'Sample book — illustrative records, read-only.';
    main.insertBefore(strip, main.firstChild);
  }

  /** True while the account is still on the password an administrator typed. */
  function mustChangePassword() {
    const session = _getSession();
    return Boolean(session && session.mustChangePassword);
  }

  /** Days left on this account's access window, or null where there is none. */
  function accessDaysRemaining() {
    const session = _getSession();
    return session && session.accessDaysRemaining != null ? session.accessDaysRemaining : null;
  }

  /** The token every request carries, or null. */
  function getToken() {
    const session = _getSession();
    return session ? session.token || null : null;
  }

  // ── Sign out ───────────────────────────────────────────────
  /**
   * Ends the session on the server as well as in this browser. Clearing
   * localStorage alone would leave a token that still works, which is the
   * whole reason a session is a row rather than a signed claim.
   */
  async function logout() {
    const token = getToken();
    if (token) {
      try {
        await fetch(`${window.CARBONIQ_API_BASE || ''}/v1/auth/logout`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) { /* Signing out locally must succeed even if the server does not answer. */ }
    }
    _clearSession();
    window.location.reload();
  }

  /** The session ended server-side; drop it and show the sign-in screen. */
  function sessionEnded() {
    _clearSession();
    window.location.reload();
  }

  // ── Page access check ──────────────────────────────────────
  function canAccessPage(pageId) {
    const session = _getSession();
    if (!session) return false;
    const role = ROLES[session.role];
    if (!role) return false;
    if (isPreview()) return PREVIEW_PAGES.indexOf(pageId) !== -1;
    const requiredLevel = PAGE_ACCESS[pageId] ?? 0;
    return role.level >= requiredLevel;
  }

  // ── Apply RBAC to nav items ────────────────────────────────
  function applyNavVisibility() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(el => {
      const item = /** @type {HTMLElement} */ (el);
      const pageId = item.dataset.page;
      if (canAccessPage(pageId)) {
        item.style.display = '';
        item.classList.remove('nav-hidden');
      } else {
        item.style.display = 'none';
        item.classList.add('nav-hidden');
      }
    });
  }

  // ── Update sidebar user badge ──────────────────────────────
  function updateUserBadge() {
    const session = _getSession();
    if (!session) return;

    const role = ROLES[session.role];
    const avatarEl = /** @type {HTMLElement|null} */ (document.querySelector('.sidebar-footer .avatar'));
    const nameEl = document.querySelector('.sidebar-footer .user-name');
    const roleEl = document.querySelector('.sidebar-footer .user-role');

    if (avatarEl) {
      avatarEl.textContent = session.initials;
      avatarEl.style.background = role ? role.avatar : 'var(--accent)';
    }
    if (nameEl) nameEl.textContent = session.name;
    if (roleEl) roleEl.textContent = role ? role.label : session.role;
  }

  // ── Show/hide login screen vs app ──────────────────────────
  function enforceAuth() {
    const loginScreen = document.getElementById('login-screen');
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    const toastContainer = document.getElementById('toast-container');

    if (isLoggedIn()) {
      if (loginScreen) loginScreen.style.display = 'none';
      if (sidebar) sidebar.style.display = '';
      if (main) main.style.display = '';
      if (toastContainer) toastContainer.style.display = '';
      updateUserBadge();
      applyNavVisibility();
      applyPreviewMark();
    } else {
      if (loginScreen) loginScreen.style.display = 'flex';
      if (sidebar) sidebar.style.display = 'none';
      if (main) main.style.display = 'none';
      if (toastContainer) toastContainer.style.display = 'none';
    }
  }

  // ── Get first accessible page for current role ─────────────
  function getDefaultPage() {
    const session = _getSession();
    if (!session) return 'dashboard';
    const role = ROLES[session.role];
    if (!role) return 'dashboard';

    // Borrowers start on AI Agents (coaching)
    if (session.role === 'borrower') return 'ai-agents';
    // Everyone else starts on dashboard
    return 'dashboard';
  }

  return {
    ROLES,
    PAGE_ACCESS,
    isLoggedIn,
    getSession,
    getRole,
    getRoleKey,
    startSession,
    getToken,
    sessionEnded,
    logout,
    canAccessPage,
    isPreview,
    applyPreviewMark,
    PREVIEW_PAGES,
    mustChangePassword,
    accessDaysRemaining,
    applyNavVisibility,
    updateUserBadge,
    enforceAuth,
    getDefaultPage,
  };
})();

// Run enforceAuth as soon as the DOM is ready (or immediately if already ready).
// This prevents any flash of the app before the login screen appears.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Auth.enforceAuth());
} else {
  Auth.enforceAuth();
}
