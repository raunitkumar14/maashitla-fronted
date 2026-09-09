import { useState } from 'react';
import './IsinMaster.css';
import UploadModal from './UploadModal';
import { ISIN_COLUMNS } from './isinColumns';

/*
 * WHY a single COLUMNS array instead of 87 hardcoded <th> tags:
 *
 * 1. Single source of truth — the field key and header label live together
 *    in one place. Renaming a field or fixing a typo means one edit, not two
 *    (the <th> AND the <td>).
 *
 * 2. Reusability — this exact array can be imported by the file-parser,
 *    the export helper, or a column-visibility picker without duplicating
 *    the field list anywhere.
 *
 * 3. Consistency — mapping over COLUMNS to render both <th> and <td> elements
 *    guarantees the header order and the data order are always in sync.
 *    With 87 hardcoded columns it's easy to accidentally shift one row cell
 *    relative to its header.
 *
 * 4. Maintainability — adding, removing, or reordering a column is a
 *    one-line change in the array. With hardcoded markup you'd touch at
 *    least three places (thead, tbody, dummy data).
 */

/*
 * IsinMaster is a "page" component — it only cares about its own content.
 * MainLayout (in App.jsx) wraps it, providing the sidebar and breadcrumb bar.
 */
function IsinMaster() {
  // Filter field state — will drive API calls later
  const [isin, setIsin]               = useState('');
  const [issuerCode, setIssuerCode]   = useState('');
  const [companyName, setCompanyName] = useState('');

  // Entries-per-page dropdown state
  const [perPage, setPerPage] = useState('5');

  /*
   * cdslData: null  → no file loaded yet; show empty-state message in table
   * cdslData: [...] → parsed records from the uploaded CDSL file
   *
   * Intentionally separate from any NSDL state so the two sides are
   * completely independent — loading a CDSL file never touches NSDL state.
   */
  const [cdslData, setCdslData] = useState(null);

  /*
   * ── Single boolean vs two separate booleans ─────────────────────────────
   * The NSDL and CDSL modals are always shown and hidden as a pair —
   * there is no valid UI state where one is open and the other is not.
   * Using ONE boolean (showUploadModal) enforces that constraint in the code:
   * true  → both modals visible
   * false → both modals hidden
   *
   * Two separate booleans (showNsdlModal + showCdslModal) would allow a
   * state like showNsdlModal=true, showCdslModal=false, which is a bug —
   * a layout with one orphaned modal floating in the center. A single flag
   * makes that impossible without any extra logic.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const [showUploadModal, setShowUploadModal] = useState(false);

  function handleUploadClick() {
    setShowUploadModal(true);
  }

  /*
   * Called by the CDSL UploadModal once FileReader + parseCdslFile have
   * finished. The NSDL modal does NOT call this — it has no onParsed prop,
   * so it stays a visual placeholder until NSDL parsing is implemented.
   *
   * TODO: once the backend API is ready, send the records here before storing:
   *
   *   import axios from 'axios';
   *   await axios.post('/api/isin-master/cdsl/import', { records });
   *
   * For now we only store locally; no network call is made.
   */
  function handleCdslParsed(records) {
    setCdslData(records);
    setShowUploadModal(false); // close both modals after successful parse
  }

  function handleSearch(e) {
    e.preventDefault();
    // TODO: call the search API with { isin, issuerCode, companyName }
    console.log('Search:', { isin, issuerCode, companyName });
  }

  function handleReset() {
    setIsin('');
    setIssuerCode('');
    setCompanyName('');
  }

  return (
    <div className="isin-master">

      {/* ── Page heading (bold title below breadcrumb) ── */}
      <h1 className="page-heading">IsinMaster</h1>

      {/* ══════════════════════════════════════════════
          TOP CARD — header bar + filter row
         ══════════════════════════════════════════════ */}
      <div className="im-card">

        {/* Blue gradient bar: label on left, UPLOAD on right */}
        <div className="im-card-header">
          <span>ISIN Master</span>
          <button className="btn-upload" onClick={handleUploadClick}>⬆ UPLOAD</button>
        </div>

        {/* Filter inputs + action buttons */}
        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input"
            placeholder="ISIN"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
          />
          <input
            className="im-input"
            placeholder="Issuer Code"
            value={issuerCode}
            onChange={(e) => setIssuerCode(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <button type="submit"  className="btn-action btn-action--pink">🔍 SEARCH</button>
          <button type="button"  className="btn-action btn-action--pink">⬇ EXPORT</button>
          <button type="button"  className="btn-action btn-action--white" onClick={handleReset}>
            RESET
          </button>
        </form>

      </div>

      {/* ══════════════════════════════════════════════
          BOTTOM CARD — table header bar + table + pagination
         ══════════════════════════════════════════════ */}
      <div className="im-card">

        {/* Blue gradient bar: label on left, entries-per-page on right */}
        <div className="im-card-header">
          <span>
            ISIN Master List
            {/* Record count badge — only shown after a real file has been loaded */}
            {cdslData && (
              <span className="record-count-badge">
                {cdslData.length} records loaded
              </span>
            )}
          </span>
          <label className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={perPage}
              onChange={(e) => setPerPage(e.target.value)}
            >
              <option>5</option>
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
          </label>
        </div>

        {/* Horizontally scrollable table wrapper */}
        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {ISIN_COLUMNS.map((col) => (
                  <th key={col.field}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cdslData === null ? (
                <tr>
                  <td className="im-empty-state" colSpan={ISIN_COLUMNS.length}>
                    No data available. Click UPLOAD to import a CDSL file.
                  </td>
                </tr>
              ) : (
                cdslData.map((row, idx) => (
                  <tr key={row.isinAlphaCode || idx}>
                    {ISIN_COLUMNS.map((col) => {
                      const val = row[col.field];
                      // Render booleans as readable text instead of true/false
                      const display = val === true ? 'Yes' : val === false ? 'No' : (val ?? '');
                      return <td key={col.field}>{display}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination bar ── */}
        <div className="im-pagination">
          <span className="pagination-info">
            {cdslData === null
              ? 'Showing 0 entries'
              : `Showing ${cdslData.length} of ${cdslData.length} entries`}
          </span>

          {/* Static page buttons — will become functional with real data */}
          <div className="pagination-controls">
            <button className="page-btn page-btn--active">1</button>
            <button className="page-btn">2</button>
            <span className="page-ellipsis">…</span>
            <button className="page-btn">11766</button>

            <span className="goto-label">Go to:</span>
            <input className="goto-input" type="number" defaultValue={1} min={1} />
            <button className="page-btn">→</button>
          </div>
        </div>

      </div>

      {/*
       * showUploadModal controls the entire overlay.
       * Both modals always render together — a single false hides both.
       * Both X buttons call the same () => setShowUploadModal(false),
       * so either one closes the whole pair at once.
       *
       * CDSL-vs-NSDL independence:
       *   • The CDSL modal gets onParsed={handleCdslParsed} — selecting a file
       *     triggers FileReader + parseCdslFile and updates cdslData state.
       *   • The NSDL modal gets no onParsed prop — it remains a visual
       *     placeholder. Neither modal waits for the other to have a file;
       *     processing is fully independent.
       */}
      {showUploadModal && (
        <div className="upload-overlay">
          {/* onParsed not passed to NSDL — NSDL parsing will be added separately */}
          <UploadModal
            title="Upload NSDL ISIN Master"
            depository="NSDL"
            onClose={() => setShowUploadModal(false)}
          />
          <UploadModal
            title="Upload CDSL ISIN Master"
            depository="CDSL"
            onClose={() => setShowUploadModal(false)}
            onParsed={handleCdslParsed}
          />
        </div>
      )}

    </div>
  );
}

export default IsinMaster;
