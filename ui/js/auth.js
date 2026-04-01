/* ============================================================
   CarbonIQ — Stakeholder Authentication & RBAC Module
   ui/js/auth.js
   ============================================================
   Manages stakeholder login, session persistence, and role-based
   page visibility. Mirrors backend ROLES from config/policies.js.

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
    'monitoring':     60,   // esg_analyst+
    'pipeline':       60,   // esg_analyst+
    'carbon-pricing': 40,   // relationship_manager+
    'reports':        30,   // auditor+
    'taxonomy':       30,   // auditor+
  };

  const STORAGE_KEY = 'carboniq_session';

  // ── Session management ─────────────────────────────────────
  function _getSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
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
    return session && session.role && ROLES[session.role];
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

  // ── Login ──────────────────────────────────────────────────
  function login(name, email, role, organisation) {
    if (!ROLES[role]) return false;

    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const session = {
      name,
      email,
      role,
      organisation: organisation || '',
      initials,
      loginTime: new Date().toISOString(),
    };

    _saveSession(session);
    return true;
  }

  // ── Logout ─────────────────────────────────────────────────
  function logout() {
    _clearSession();
    window.location.reload();
  }

  // ── Page access check ──────────────────────────────────────
  function canAccessPage(pageId) {
    const session = _getSession();
    if (!session) return false;
    const role = ROLES[session.role];
    if (!role) return false;
    const requiredLevel = PAGE_ACCESS[pageId] ?? 0;
    return role.level >= requiredLevel;
  }

  // ── Apply RBAC to nav items ────────────────────────────────
  function applyNavVisibility() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
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
    const avatarEl = document.querySelector('.sidebar-footer .avatar');
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
    login,
    logout,
    canAccessPage,
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
