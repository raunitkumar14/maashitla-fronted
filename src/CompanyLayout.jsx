import { useEffect } from 'react';
import { useParams, useLocation, useNavigate, Outlet } from 'react-router-dom';
import './Sidebar.css';
import './MainLayout.css';
import './CompanyDetail.css';
import './CompanyLayout.css';

const COMPANY_NAV = [
  { label: 'Dashboard',        icon: '⊞',  path: 'dashboard' },
  { label: 'Physical',         icon: '📄',  path: 'physical' },
  { label: 'NSDL',             icon: '🏛️', path: 'nsdl' },
  { label: 'CDSL',             icon: '💼',  path: 'cdsl' },
  { label: 'Transactions',     icon: '🔄',  path: 'transactions' },
  { label: 'Promoter',         icon: '👤',  path: 'promoter' },
  { label: 'Category convert', icon: '🔗',  path: 'category-convert' },
];

const TAB_TITLES = {
  dashboard:          'Dashboard',
  physical:           'Physical',
  nsdl:               'NSDL',
  cdsl:               'CDSL',
  transactions:       'Transactions',
  promoter:           'Promoter',
  'category-convert': 'Category Convert',
};

// ── Shared "Coming Soon" placeholder used for unbuilt tabs ────────────────────
export function CompanyComingSoon({ title }) {
  return (
    <div className="co-coming-soon">
      <h2 className="co-coming-soon-title">{title}</h2>
      <p className="co-coming-soon-text">Coming soon</p>
    </div>
  );
}

// ── Company-scoped layout ─────────────────────────────────────────────────────
function CompanyLayout() {
  const { issuerCode } = useParams();
  const location       = useLocation();
  const navigate       = useNavigate();

  // Persist the company row from the first navigation so it survives sidebar
  // clicks (which don't carry state).  Read back from sessionStorage as fallback.
  useEffect(() => {
    const row = location.state?.row;
    if (row) {
      try { sessionStorage.setItem(`co_row_${issuerCode}`, JSON.stringify(row)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerCode]);

  function getCompanyRow() {
    if (location.state?.row) return location.state.row;
    try {
      const s = sessionStorage.getItem(`co_row_${issuerCode}`);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  }

  const companyRow  = getCompanyRow();
  const companyName = companyRow.issuerName ?? companyRow.issuerCode ?? issuerCode;

  // Derive active tab from the last URL segment
  const pathParts  = location.pathname.split('/').filter(Boolean);
  const activeSlug = pathParts[pathParts.length - 1];
  const pageTitle  = TAB_TITLES[activeSlug] ?? 'Company';

  return (
    <div className="layout">

      {/* ── Company-scoped sidebar — never renders the main app's Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-kt">kt</span>
          <span className="logo-rta">RTA</span>
        </div>
        <nav className="sidebar-nav">
          {COMPANY_NAV.map((item) => {
            const fullPath = `/company/${issuerCode}/${item.path}`;
            const isActive = location.pathname === fullPath;
            return (
              <div
                key={item.label}
                className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                onClick={() => navigate(fullPath)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ── Content column ── */}
      <div className="layout-content">

        {/* ── Breadcrumb bar: title on left, badges + company name on right ── */}
        <div className="breadcrumb-bar co-breadcrumb-bar">
          <div className="co-breadcrumb-left">
            <span className="breadcrumb-home">🏠</span>
            <span className="breadcrumb-segment">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{pageTitle}</span>
            </span>
          </div>
          <div className="co-breadcrumb-right">
            <span className="cd-badge cd-badge--physical">Physical: 0</span>
            <span className="cd-badge cd-badge--nsdl">NSDL: 0</span>
            <span className="cd-badge cd-badge--cdsl">CDSL: 0</span>
            <span className="cd-company-name">
              <span className="cd-company-icon">🏢</span>
              {companyName}
            </span>
          </div>
        </div>

        {/* ── Active sub-route renders here ── */}
        <main className="layout-main">
          <Outlet />
        </main>

      </div>
    </div>
  );
}

export default CompanyLayout;
