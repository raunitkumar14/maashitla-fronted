import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from './api/axios';
import './Sidebar.css';

/*
 * NAV_ITEMS is defined outside the component so it's created once, not on every render.
 * Items with a `children` array are expandable accordion sections.
 * Items with a `path` navigate to that route when clicked.
 * Items with `hasSubmenu` (but no children) show a toggle arrow as a visual placeholder
 * until their sub-pages are built out.
 */
const NAV_ITEMS = [
  { label: 'Dashboard',         icon: '⊞' },
  { label: 'Company',           icon: '🏢', path: '/company' },
  { label: 'Inward',            icon: '📥' },
  { label: 'Outward',           icon: '📤' },
  { label: 'Daak Entry',        icon: '📮' },
  { label: 'Corporate Action',  icon: '⚙️' },
  {
    label: 'Reports',
    icon: '📊',
    hasSubmenu: true,
    children: [
      { label: 'BenPos',              icon: '📄', path: '/reports/benpos' },
      { label: 'PAS-6',              icon: '📋', path: '/reports/pas6' },
      { label: 'Share Capital Audit', icon: '📑', path: '/reports/share-capital-audit' },
      { label: 'Comparison',          icon: '📊', path: '/reports/comparison' },
      { label: 'E-Voting',            icon: '🗳️', path: '/reports/e-voting' },
      { label: 'Shareholding Pattern',icon: 'SP', path: '/reports/shareholding-pattern' },
    ],
  },
  { label: 'Reconciliation',    icon: '🔄', hasSubmenu: true },
  { label: 'ISIN Master',       icon: '📋', path: '/isin-master' },
  { label: 'Complaint',         icon: '💬' },
  { label: 'Category Mapping',  icon: '🔗', badge: 'CM' },
  { label: 'Pan Freeze',        icon: '🔒' },
  { label: 'Shareholder Search',icon: '🔍' },
  {
    label: 'User Management',
    icon: '👥',
    hasSubmenu: true,
    children: [
      { label: 'User',          icon: '👤', path: '/user-management/users' },
      { label: 'Role',          icon: '🔐', path: '/user-management/roles' },
      { label: 'Login History', icon: '📜', path: '/user-management/login-history' },
    ],
  },
  { label: 'Profile',           icon: '👤', path: '/profile' },
  { label: 'Logout',            icon: '🚪' },
];

// Returns the label of the top-level item that owns the given pathname, or null.
function menuForPath(pathname) {
  for (const item of NAV_ITEMS) {
    if (item.children?.some((child) => child.path === pathname)) {
      return item.label;
    }
  }
  return null;
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  /*
   * openMenu holds the label of whichever top-level section is currently
   * expanded, or null when all sections are collapsed.
   *
   * Why one "which menu is open" variable beats N separate booleans:
   *   With N expandable sections you'd need showReports, showReconciliation,
   *   showUserManagement… Opening section A means setting showA = true AND
   *   manually setting every other boolean to false — O(N) writes and easy to
   *   miss one. A single string makes mutual exclusion implicit: storing
   *   'User Management' automatically "closes" every other section because only
   *   one string value can be held at a time. Adding a new expandable item later
   *   costs one line of data, not two (data definition + close-all logic).
   */
  const [openMenu, setOpenMenu] = useState(() => menuForPath(location.pathname));

  // Keep the accordion in sync when the user navigates via browser back/forward.
  useEffect(() => {
    const owner = menuForPath(location.pathname);
    if (owner) setOpenMenu(owner);
  }, [location.pathname]);

  async function handleLogout() {
    // Call the backend BEFORE clearing localStorage: the request interceptor
    // attaches the token from localStorage as the Authorization header, so the
    // server can identify which session to mark as logged out (setting logoutAt).
    // Clearing localStorage first would strip the header and the server would
    // have no way to know which session to close.
    try {
      await api.post('/admin/v1/auth/logout');
    } catch {
      // A failed call (network error, already-expired token) must never block
      // the user from logging out locally — fall through regardless.
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  function handleTopItemClick(item) {
    if (item.label === 'Logout') {
      handleLogout();
      return;
    }
    if (item.children) {
      // Toggle: clicking the open section closes it; clicking any other section
      // opens it and implicitly closes the previous one (single value = one open).
      setOpenMenu((prev) => (prev === item.label ? null : item.label));
      return;
    }
    if (item.path) {
      navigate(item.path);
    }
  }

  return (
    <aside className="sidebar">

      {/* ── Logo ── */}
      <div className="sidebar-logo">
        <span className="logo-rta">RTA</span>
      </div>

      {/* ── Navigation list ── */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isOpen   = openMenu === item.label;
          const isActive = item.path != null && location.pathname === item.path;

          return (
            <div key={item.label} className="nav-group">

              {/* Top-level nav row */}
              <div
                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                onClick={() => handleTopItemClick(item)}
              >
                {item.badge && <span className="nav-badge">{item.badge}</span>}
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.hasSubmenu && (
                  <span className={`nav-arrow ${isOpen ? 'nav-arrow--open' : ''}`}>▸</span>
                )}
              </div>

              {/* Sub-items — only rendered while this section is expanded */}
              {item.children && isOpen && (
                <div className="nav-subitems">
                  {item.children.map((child) => (
                    <div
                      key={child.label}
                      className={`nav-subitem ${location.pathname.startsWith(child.path) ? 'nav-subitem--active' : ''}`}
                      onClick={() => navigate(child.path)}
                    >
                      <span className="nav-icon">{child.icon}</span>
                      <span className="nav-label">{child.label}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          );
        })}
      </nav>

    </aside>
  );
}

export default Sidebar;
