import { useState } from 'react';
import './IsinMaster.css';
import './PanSearch.css';
import { hasPermission } from './auth';
import { search, exportXlsx } from './services/panSearchService';
import { triggerDownload } from './services/daakService';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function fmtDate(iso) {
  if (!iso || iso.length < 10) return '-';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function fmtQty(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-IN');
}

function PanSearch() {
  const canExport = hasPermission('pan_search:export');

  const [pan,         setPan]         = useState('');
  const [panError,    setPanError]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [fetchError,  setFetchError]  = useState('');
  const [result,      setResult]      = useState(null);
  const [searchedPan, setSearchedPan] = useState('');
  const [exporting,   setExporting]   = useState(false);

  function validate() {
    const v = pan.trim();
    if (!v) {
      setPanError('PAN Number is required.');
      return false;
    }
    if (!PAN_RE.test(v)) {
      setPanError('Invalid PAN format (e.g. ABCDE1234F).');
      return false;
    }
    setPanError('');
    return true;
  }

  async function handleSearch() {
    if (!validate()) return;
    setLoading(true);
    setFetchError('');
    setResult(null);
    try {
      const data = await search(pan.trim());
      setResult(data);
      setSearchedPan(pan.trim());
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setPan('');
    setPanError('');
    setResult(null);
    setSearchedPan('');
    setFetchError('');
  }

  async function handleExport() {
    if (!searchedPan) return;
    setExporting(true);
    try {
      const res = await exportXlsx(searchedPan);
      const cd    = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      triggerDownload(res.data, match?.[1] || `PAN_${searchedPan}_${today}.xlsx`);
    } catch (err) {
      setFetchError(err.response?.data?.error?.message ?? err.message ?? 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const hasItems = result?.items?.length > 0;

  return (
    <div className="isin-master">
      <h1 className="page-heading">PAN Search</h1>

      {/* ── Search form ── */}
      <div className="im-card">
        <div className="im-card-header">Search</div>
        <div className="ps-form-row">
          <div className="ps-field">
            <label className="ps-label">
              PAN Number <span className="ps-required">*</span>
            </label>
            <input
              className={`im-input im-input--wide${panError ? ' ps-input--error' : ''}`}
              value={pan}
              onChange={e => { setPan(e.target.value.toUpperCase()); setPanError(''); }}
              maxLength={10}
              placeholder="e.g. ABCDE1234F"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {panError && <span className="ps-err">{panError}</span>}
          </div>
          <div className="ps-btns">
            <button
              className="btn-action btn-action--pink"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? 'Searching…' : 'SEARCH'}
            </button>
            <button
              className="btn-action btn-action--white"
              onClick={handleClear}
              disabled={loading}
            >
              CLEAR
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {fetchError && (
        <div className="im-banner im-banner--error">{fetchError}</div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="im-card">
          <div className="im-card-header">Results</div>
          <div className="im-empty-state">Searching…</div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && result && (
        <div className="im-card">
          <div className="im-card-header">
            <span>Results for {searchedPan}</span>
            {hasItems && canExport && (
              <button
                className="btn-upload"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : '⬇ EXPORT'}
              </button>
            )}
          </div>

          {!hasItems ? (
            <div className="im-empty-state">No records found for this PAN.</div>
          ) : (
            <div className="im-table-wrapper">
              <table className="im-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>ISIN</th>
                    <th>Company Name</th>
                    <th>Date</th>
                    <th>Holder Name</th>
                    <th>DP-Client ID / Folio</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((row, i) => (
                    <tr key={i}>
                      <td>{row.source}</td>
                      <td>{row.isin}</td>
                      <td>{row.companyName}</td>
                      <td>{row.source === 'PHYSICAL' || !row.date ? '-' : fmtDate(row.date)}</td>
                      <td>{row.holderName}</td>
                      <td>{row.source === 'PHYSICAL' ? (row.folioNo ?? '-') : (row.dpClientId ?? '-')}</td>
                      <td style={{ textAlign: 'right' }}>{fmtQty(row.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PanSearch;
