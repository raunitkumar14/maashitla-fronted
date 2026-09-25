import { createContext, useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Outlet } from 'react-router-dom';
import './Sidebar.css';
import './MainLayout.css';
import './CompanyDetail.css';
import './CompanyLayout.css';

// Context that child pages use to push their record counts up to the header bar.
export const CompanyCounts = createContext({
  nsdlCount: 0, setNsdlCount: () => {},
  cdslCount: 0, setCdslCount: () => {},
});

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

  const [nsdlCount, setNsdlCount] = useState(0);
  const [cdslCount, setCdslCount] = useState(0);

  // Persist the company row and selected isinCode so both survive sidebar
  // clicks (which don't carry navigation state).
  useEffect(() => {
    const row  = location.state?.row;
    const isin = location.state?.isinCode;
    if (row)  { try { sessionStorage.setItem(`co_row_${issuerCode}`,  JSON.stringify(row)); } catch {} }
    if (isin) { try { sessionStorage.setItem(`co_isin_${issuerCode}`, isin);                } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerCode]);

  function getCompanyRow() {
    if (location.state?.row) return location.state.row;
    try {
      const s = sessionStorage.getItem(`co_row_${issuerCode}`);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  }

  function getIsinCode() {
    if (location.state?.isinCode) return location.state.isinCode;
    try { return sessionStorage.getItem(`co_isin_${issuerCode}`) ?? ''; } catch { return ''; }
  }

  const companyRow  = getCompanyRow();
  const isinCode    = getIsinCode();
  const companyName = companyRow.issuerName ?? companyRow.issuerCode ?? issuerCode;

  // Derive active tab from the last URL segment
  const pathParts  = location.pathname.split('/').filter(Boolean);
  const activeSlug = pathParts[pathParts.length - 1];
  const pageTitle  = TAB_TITLES[activeSlug] ?? 'Company';

  return (
    <CompanyCounts.Provider value={{ nsdlCount, setNsdlCount, cdslCount, setCdslCount }}>
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
              <span
                className="co-isins-link"
                onClick={() => navigate(`/company/${issuerCode}/isins`, { state: { companyRow } })}
              >
                {companyName} ISINs
              </span>
            </span>
            <span className="breadcrumb-segment">
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{pageTitle}</span>
            </span>
          </div>
          <div className="co-breadcrumb-right">
            {isinCode && (
              <span className="cd-badge cd-badge--isin">{isinCode}</span>
            )}
            <span className="cd-badge cd-badge--physical">Physical: 0</span>
            <span className="cd-badge cd-badge--nsdl">NSDL: {nsdlCount.toLocaleString()}</span>
            <span className="cd-badge cd-badge--cdsl">CDSL: {cdslCount.toLocaleString()}</span>
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
    </CompanyCounts.Provider>
  );
}

export default CompanyLayout;
