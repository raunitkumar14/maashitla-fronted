import Sidebar from './Sidebar';
import './MainLayout.css';

/*
 * MainLayout is the "parent shell" that assembles the full app frame.
 * It renders two children side by side:
 *
 *   ┌──────────┬─────────────────────────────┐
 *   │          │  Breadcrumb bar             │
 *   │ Sidebar  ├─────────────────────────────┤
 *   │          │  {children} — page content  │
 *   └──────────┴─────────────────────────────┘
 *
 * The `children` prop is whatever App.jsx (or a future router) passes in.
 * Sidebar doesn't know about children; it just draws the nav.
 * MainLayout doesn't know what the children contain; it just positions them.
 * This separation means you can swap page content without touching the layout.
 */
/*
 * MainLayout accepts either:
 *   pageName  (string) — renders "🏠 / pageName"   (single-level, the default)
 *   breadcrumbs (array) — renders "🏠 / seg1 / seg2 / …" (multi-level)
 * breadcrumbs takes precedence when both are provided.
 */
function MainLayout({ children, pageName = 'Page', breadcrumbs }) {
  const segments = breadcrumbs ?? [pageName];

  return (
    <div className="layout">

      {/* Left: fixed sidebar — see Sidebar.jsx for nav items */}
      <Sidebar />

      {/* Right: everything to the right of the sidebar */}
      <div className="layout-content">

        {/* ── Breadcrumb bar ── */}
        <div className="breadcrumb-bar">
          <span className="breadcrumb-home">🏠</span>
          {segments.map((seg, i) => (
            <span key={i} className="breadcrumb-segment">
              <span className="breadcrumb-sep">/</span>
              <span className={i === segments.length - 1 ? 'breadcrumb-current' : 'breadcrumb-ancestor'}>
                {seg}
              </span>
            </span>
          ))}
        </div>

        {/* ── Main page area ── */}
        {/*
         * This is where each page's content renders.
         * App.jsx passes children here; later, React Router will swap them
         * based on the URL without remounting MainLayout or Sidebar.
         */}
        <main className="layout-main">
          {children}
        </main>

      </div>
    </div>
  );
}

export default MainLayout;
