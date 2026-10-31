import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './Company.css';
import { useColumnVisibility } from './hooks/useColumnVisibility';
import { ColumnSelector } from './components/ColumnSelector';
import { LISTING_AT_OPTIONS, parseListingAt, ListedAtCheckboxes } from './components/ListedAtCheckboxes';

function cell(row, field) {
  const v = row[field];
  return (v == null || v === '') ? '—' : v;
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return String(val);
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

// ── Column definitions ────────────────────────────────────────────────────────
// render(row, ctx) — ctx = { page, perPage, idx, companyName }

const ISINS_COLUMNS = [
  { field: 'srNo',         header: 'Sr. No.',                   render: (row, { page, perPage, idx }) => (page - 1) * perPage + idx + 1 },
  { field: 'isin',         header: 'ISIN',                      render: row => cell(row, 'isin') },
  { field: 'isinDesc',     header: 'ISIN Description',          render: row => cell(row, 'isinDescription') },
  { field: 'nameOfIssuer', header: 'Name of Issuer',            render: (row, { companyName }) => row.issuer?.issuerName || companyName || '—' },
  { field: 'secType',      header: 'Security Type Description', render: row => cell(row, 'securityType') },
  { field: 'isinStatus',    header: 'ISIN Status',               render: row => cell(row, 'isinStatus') },
  { field: 'listingStatus', header: 'Listing Status',            render: row => cell(row, 'listingStatus') },
  { field: 'listingAt',     header: 'Listed At',                 render: row => { const list = parseListingAt(row.listingAt); return list.length ? list.join(', ') : '—'; } },
  { field: 'listingDate',   header: 'Listing Date',              render: row => formatDate(row.listingDate) },
  { field: 'symbol',        header: 'Symbol',                    render: row => cell(row, 'symbol') },
  { field: 'scripCode',     header: 'Scrip Code',                render: row => cell(row, 'scripCode') },
];

const VISIBILITY_COLUMNS = ISINS_COLUMNS.map(col => ({
  key:            col.field,
  label:          col.header,
  defaultVisible: true,
  locked:         col.field === 'isin',
}));

function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2) pages.push('...');
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function PaginationBar({ page, perPage, totalCount, totalPages, goto, setPage, setGoto, onGoto }) {
  const first = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last  = Math.min(page * perPage, totalCount);
  return (
    <div className="im-pagination">
      <span className="pagination-info">
        {totalCount === 0 ? 'Showing 0 entries' : `Showing ${first} to ${last} of ${totalCount} entries`}
      </span>
      <div className="pagination-controls">
        {getPageRange(page, totalPages).map((item, idx) =>
          item === '...'
            ? <span key={`ellipsis-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            )
        )}
        <span className="goto-label">Go to:</span>
        <input
          className="goto-input"
          type="number"
          min={1}
          max={totalPages || 1}
          value={goto}
          onChange={e => setGoto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

// ── EditListingModal ──────────────────────────────────────────────────────────

function EditListingModal({ row, onClose, onSaved }) {
  const _allParsed   = parseListingAt(row.listingAt);
  const _legacyItems = _allParsed.filter(v => !LISTING_AT_OPTIONS.includes(v));
  const legacyNote   = _legacyItems.length
    ? `Previous non-standard value(s) will be removed on save: ${_legacyItems.join(', ')}`
    : null;

  const [form, setForm] = useState({
    listingStatus: row.listingStatus ?? '',
    listingAt:     _allParsed.filter(v => LISTING_AT_OPTIONS.includes(v)),
    listingDate:   row.listingDate   ? String(row.listingDate).slice(0, 10) : '',
    symbol:        row.symbol        ?? '',
    scripCode:     row.scripCode     ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    setErrMsg('');
    try {
      const body = {
        listingStatus: form.listingStatus || null,
        listingAt:     form.listingAt.length ? form.listingAt : null,
        listingDate:   form.listingDate   || null,
        symbol:        form.symbol        || null,
        scripCode:     form.scripCode     || null,
      };
      await api.patch(`/admin/v1/isins/${row.isin}`, body);
      onSaved(row.isin, body);
    } catch (err) {
      setErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const FIELDS = [
    { key: 'listingStatus', label: 'Listing Status', type: 'text' },
    { key: 'listingDate',   label: 'Listing Date',    type: 'date' },
    { key: 'symbol',        label: 'Symbol',          type: 'text' },
    { key: 'scripCode',     label: 'Scrip Code',      type: 'text' },
  ];

  return (
    <div className="upload-overlay" onClick={!saving ? onClose : undefined}>
      <div className="im-edit-listing-modal" onClick={e => e.stopPropagation()}>
        <div className="um-header">
          <span className="um-header-badge" style={{ fontSize: 14 }}>&#9998;</span>
          <span className="um-header-title">Edit Listing Details &mdash; {row.isin}</span>
          <button className="um-close-btn" onClick={onClose} disabled={saving} aria-label="Close">&times;</button>
        </div>
        <div className="im-edit-listing-body">
          {errMsg && (
            <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>&#9888; {errMsg}</div>
          )}
          <div className="im-edit-listing-grid">
            {FIELDS.map(({ key, label, type }) => (
              <div key={key} className="im-edit-listing-field">
                <label htmlFor={`eli-${key}`}>{label}</label>
                <input
                  id={`eli-${key}`}
                  type={type}
                  className="im-input im-edit-listing-input"
                  value={form[key]}
                  onChange={e => setField(key, e.target.value)}
                  disabled={saving}
                />
              </div>
            ))}
          </div>
          <div className="im-edit-listing-field im-edit-listing-exchanges">
            <label>Listed At</label>
            <ListedAtCheckboxes
              selected={form.listingAt}
              onChange={val => setField('listingAt', val)}
              disabled={saving}
              legacyNote={legacyNote}
            />
          </div>
        </div>
        <div className="im-edit-listing-footer">
          <button className="btn-action btn-action--pink" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-action btn-action--white" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyIsins() {
  const { issuerCode } = useParams();
  const location       = useLocation();
  const navigate       = useNavigate();

  // Persist company row in the same sessionStorage key CompanyLayout uses,
  // so both pages share the same cached company data.
  useEffect(() => {
    const row = location.state?.companyRow;
    if (row) {
      try { sessionStorage.setItem(`co_row_${issuerCode}`, JSON.stringify(row)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerCode]);

  function getCompanyRow() {
    if (location.state?.companyRow) return location.state.companyRow;
    try {
      const s = sessionStorage.getItem(`co_row_${issuerCode}`);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  }

  const companyRow  = getCompanyRow();
  const companyName = companyRow.issuerName || companyRow.issuerCode || issuerCode;
  const companyLabel = companyRow.issuerName
    ? `${companyRow.issuerName} (${issuerCode})`
    : issuerCode;

  const [isins,      setIsins]      = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [page,       setPage]       = useState(1);
  const [perPage,    setPerPage]    = useState(25);
  const [goto,       setGoto]       = useState('');
  const [isinFilter, setIsinFilter] = useState('');
  const [fetchKey,   setFetchKey]   = useState(0);
  const [editRow,    setEditRow]    = useState(null);
  const [saveMsg,    setSaveMsg]    = useState('');

  // ── Column visibility ─────────────────────────────────────────────────────

  const { visibleKeys, isVisible, toggle, setAll, reset: resetColumns } =
    useColumnVisibility('company-isins', VISIBILITY_COLUMNS);

  const visibleCols = ISINS_COLUMNS.filter(col => isVisible(col.field));

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get('/admin/v1/isins', {
          params: { issuerCode, page, pageSize: perPage },
        });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setIsins(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setFetchError('Failed to load ISINs. Please try again.');
          setIsins([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [issuerCode, page, perPage, fetchKey]);

  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

  function handleEditSaved(isin, updatedFields) {
    setEditRow(null);
    setSaveMsg('✓ Listing details saved.');
    setIsins(prev => prev.map(r => r.isin === isin ? { ...r, ...updatedFields } : r));
    setTimeout(() => setSaveMsg(''), 4000);
  }

  function handleIsinClick(isinRow) {
    if (window.getSelection().toString().length > 0) return;
    navigate(`/company/${issuerCode}/physical`, {
      state: { row: companyRow, isinCode: isinRow.isin, isinRow },
    });
  }

  return (
    <div className="isin-master">

      {/* ── Breadcrumb / back ── */}
      <div className="ci-breadcrumb">
        <button className="ci-back-btn" onClick={() => navigate('/company')}>
          ← Company List
        </button>
        <span className="ci-breadcrumb-sep">/</span>
        <span className="ci-breadcrumb-current">{companyLabel}</span>
      </div>

      <h1 className="page-heading">ISINs — {companyName}</h1>

      {saveMsg && (
        <div className="im-banner im-banner--success">{saveMsg}</div>
      )}

      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN List</span>
          <div className="im-header-actions">
            <ColumnSelector
              columns={VISIBILITY_COLUMNS}
              visibleKeys={visibleKeys}
              onToggle={toggle}
              onSetAll={setAll}
              onReset={resetColumns}
            />
            <label className="entries-label">
              Entries per page
              <select
                className="entries-select"
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {fetchError}
          </div>
        )}

        <div className="company-search-row">
          <input
            className="im-input"
            placeholder="Search ISIN…"
            value={isinFilter}
            onChange={e => setIsinFilter(e.target.value)}
          />
        </div>

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {visibleCols.map(col => <th key={col.field}>{col.header}</th>)}
                <th className="im-action-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = isinFilter.trim()
                  ? isins.filter(r => (r.isin ?? '').toUpperCase().includes(isinFilter.trim().toUpperCase()))
                  : isins;
                if (loading) return (
                  <tr><td className="im-empty-state" colSpan={visibleCols.length + 1}>Loading…</td></tr>
                );
                if (filtered.length === 0) return (
                  <tr>
                    <td className="im-empty-state" colSpan={visibleCols.length + 1}>
                      {isinFilter.trim() ? 'No ISINs match that filter.' : 'No ISINs found for this company.'}
                    </td>
                  </tr>
                );
                return filtered.map((row, idx) => (
                  <tr
                    key={row.isin || idx}
                    className="ci-isin-row"
                    onClick={() => handleIsinClick(row)}
                    title="Open mini-dashboard for this ISIN"
                  >
                    {visibleCols.map(col => (
                      <td key={col.field}>{col.render(row, { page, perPage, idx, companyName })}</td>
                    ))}
                    <td className="im-action-cell" onClick={e => e.stopPropagation()}>
                      <button className="im-row-edit-btn" onClick={() => setEditRow(row)}>Edit</button>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          totalPages={totalPages}
          goto={goto}
          setPage={setPage}
          setGoto={setGoto}
          onGoto={handleGoto}
        />
      </div>

      {editRow && (
        <EditListingModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}

export default CompanyIsins;
