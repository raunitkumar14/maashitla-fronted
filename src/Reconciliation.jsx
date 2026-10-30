import { useState, useEffect, useCallback, useRef } from 'react';
import api from './api/axios';
import './IsinMaster.css';
import './Reconciliation.css';

// ── Column definitions (29 data columns) ─────────────────────────────────────

const COLS = [
  { header: 'Sr No',                          field: 'srNo' },
  { header: 'Recon Date',                     field: 'reconDate' },
  { header: 'Day',                            field: 'dayName' },
  { header: 'ISIN',                           field: 'isin' },
  { header: 'ISIN Name',                      field: 'isinName' },
  { header: 'Security Type',                  field: 'securityType' },
  { header: 'FV',                             field: 'fv',                          numeric: true },
  { header: 'PV',                             field: 'pv',                          numeric: true },
  { header: 'Total Opening Position',         field: 'totalOpeningPosition',        numeric: true },
  { header: 'Opening Physical Position',      field: 'openingPhysicalPosition',     numeric: true },
  { header: 'Opening NSDL Position',          field: 'openingNsdlPosition',         numeric: true },
  { header: 'Opening CDSL Position',          field: 'openingCdslPosition',         numeric: true },
  { header: 'IDT NSDL In',                    field: 'idtNsdlIn',                   numeric: true },
  { header: 'IDT CDSL In',                    field: 'idtCdslIn',                   numeric: true },
  { header: 'IDT NSDL Out',                   field: 'idtNsdlOut',                  numeric: true },
  { header: 'IDT CDSL Out',                   field: 'idtCdslOut',                  numeric: true },
  { header: 'Demat NSDL',                     field: 'dematNsdl',                   numeric: true },
  { header: 'Demat CDSL',                     field: 'dematCdsl',                   numeric: true },
  { header: 'Remat NSDL',                     field: 'rematNsdl',                   numeric: true },
  { header: 'Remat CDSL',                     field: 'rematCdsl',                   numeric: true },
  { header: 'Corp Action NSDL',               field: 'corporateActionNsdl',         numeric: true },
  { header: 'Corp Action CDSL',               field: 'corporateActionCdsl',         numeric: true },
  { header: 'Corp Action Physical',           field: 'corporateActionPhysical',     numeric: true },
  { header: 'Closing Physical Position',      field: 'closingPhysicalPosition',     numeric: true },
  { header: 'Closing NSDL Position',          field: 'closingNsdlPosition',         numeric: true },
  { header: 'Closing CDSL Position',          field: 'closingCdslPosition',         numeric: true },
  { header: 'Total Closing Position',         field: 'totalClosingPosition',        numeric: true },
  { header: 'Mismatch',                       field: 'mismatchFlag',                mismatch: true },
  { header: 'Remark',                         field: 'remark' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  const formatted = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  return n < 0 ? `-${formatted}` : formatted;
}

function getPageRange(current, total) {
  if (total <= 0) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end   = Math.min(total - 1, current + 1);
  if (start > 2)       pages.push('...');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('...');
  pages.push(total);
  return pages;
}

function PaginationBar({ page, perPage, totalCount, totalPages, goto, setPage, setGoto, onGoto }) {
  const first = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last  = Math.min(page * perPage, totalCount);
  return (
    <div className="im-pagination">
      <span className="pagination-info">
        {totalCount === 0
          ? 'Showing 0 entries'
          : `Showing ${first} to ${last} of ${totalCount} entries`}
      </span>
      <div className="pagination-controls">
        {getPageRange(page, totalPages).map((item, idx) =>
          item === '...'
            ? <span key={`e-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >{item}</button>
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
        <button className="page-btn" onClick={onGoto}>&rarr;</button>
      </div>
    </div>
  );
}

// ── Reconciliation page ───────────────────────────────────────────────────────

function Reconciliation() {
  // Filters
  const [reconDate,    setReconDate]    = useState('');
  const [search,       setSearch]       = useState('');
  const [mismatchFlag, setMismatchFlag] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Date dropdown options
  const [dates, setDates] = useState([]);

  // Table state
  const [rows,       setRows]       = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Pagination
  const [page,     setPageRaw] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goto,     setGoto]    = useState('');

  const searchTimerRef = useRef(null);

  // ── Load available dates (union of CDSL + NSDL) ───────────────────────────

  useEffect(() => {
    Promise.all([
      api.get('/admin/v1/reconciliations/imports/dates', { params: { depository: 'CDSL' } }),
      api.get('/admin/v1/reconciliations/imports/dates', { params: { depository: 'NSDL' } }),
    ]).then(([cdslRes, nsdlRes]) => {
      const cdslDates = cdslRes.data?.data?.dates ?? cdslRes.data?.dates ?? [];
      const nsdlDates = nsdlRes.data?.data?.dates ?? nsdlRes.data?.dates ?? [];
      const allDates  = cdslDates.map(d => d.reconDate);
      nsdlDates.forEach(d => { if (!allDates.includes(d.reconDate)) allDates.push(d.reconDate); });
      allDates.sort((a, b) => b.localeCompare(a)); // newest first
      setDates(allDates);
    }).catch(() => {});
  }, []);

  // ── Debounce search ───────────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAppliedSearch(search);
      setPageRaw(1);
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // ── Load rows ─────────────────────────────────────────────────────────────

  const loadRows = useCallback(() => {
    setLoading(true);
    setFetchError('');

    const params = { page, limit: pageSize };
    if (reconDate)    params.reconDate    = reconDate;
    if (appliedSearch) params.search      = appliedSearch;
    if (mismatchFlag) params.mismatchFlag = mismatchFlag;

    api.get('/admin/v1/reconciliations', { params })
      .then(res => {
        const d = res.data?.data ?? res.data ?? {};
        setRows(d.items ?? []);
        setTotalCount(d.total ?? 0);
        setTotalPages(d.totalPages ?? 0);
      })
      .catch(err => {
        setFetchError(err.response?.data?.message || err.message || 'Failed to load data');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, reconDate, appliedSearch, mismatchFlag]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setPage(p) { setPageRaw(p); setGoto(''); }

  function onGoto() {
    const p = parseInt(goto, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) setPage(p);
    setGoto('');
  }

  function renderCell(col, row) {
    const val = row[col.field];

    if (col.mismatch) {
      const match = val === false || val === 0 || val === 'false' || val === 'Match';
      return (
        <span className={match ? 'reco-badge reco-badge--match' : 'reco-badge reco-badge--mismatch'}>
          {match ? 'Match' : 'Mismatch'}
        </span>
      );
    }

    if (col.numeric) {
      const n = Number(val);
      const txt = fmtNum(val);
      return (
        <span style={!isNaN(n) && n < 0 ? { color: '#c62828' } : {}}>
          {txt}
        </span>
      );
    }

    return val ?? '';
  }

  function renderBody() {
    if (loading) {
      return (
        <tr>
          <td colSpan={COLS.length} style={{ textAlign: 'center', padding: '24px', color: '#888', fontSize: '13px' }}>
            Loading…
          </td>
        </tr>
      );
    }

    if (fetchError) {
      return (
        <tr>
          <td colSpan={COLS.length} style={{ textAlign: 'center', padding: '24px', color: '#c62828', fontSize: '13px' }}>
            {fetchError}
          </td>
        </tr>
      );
    }

    if (!rows || rows.length === 0) {
      return (
        <tr>
          <td colSpan={COLS.length}>
            <div className="reco-empty-state">
              <div className="reco-empty-circle">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="#90caf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="21 8 21 21 3 21 3 8"/>
                  <rect x="1" y="3" width="22" height="5"/>
                  <line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
              </div>
              <p className="reco-empty-text">No reconciliation data available</p>
            </div>
          </td>
        </tr>
      );
    }

    return rows.map((row, i) => (
      <tr key={row.id ?? i}>
        {COLS.map(col => (
          <td
            key={col.field}
            className={col.numeric ? 'reco-td-num' : ''}
          >
            {renderCell(col, row)}
          </td>
        ))}
      </tr>
    ));
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">Reconciliation</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>Reconciliation List</span>
          <div className="im-header-actions">
            {/* Date filter */}
            <div className="reco-hdr-field">
              <select
                className="reco-hdr-select"
                value={reconDate}
                onChange={e => { setReconDate(e.target.value); setPage(1); }}
              >
                <option value="">All Dates</option>
                {dates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Mismatch filter */}
            <div className="reco-hdr-field">
              <select
                className="reco-hdr-select"
                value={mismatchFlag}
                onChange={e => { setMismatchFlag(e.target.value); setPage(1); }}
              >
                <option value="">All</option>
                <option value="true">Mismatch Only</option>
                <option value="false">Match Only</option>
              </select>
            </div>

            {/* Search */}
            <input
              className="im-input"
              type="text"
              placeholder="Search ISIN / name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Entries per page */}
            <label className="entries-label">
              Entries
              <select
                className="entries-select"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        <div className="im-table-wrapper reco-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {COLS.map(col => (
                  <th key={col.field} className={col.numeric || col.mismatch ? 'reco-th-num' : ''}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderBody()}
            </tbody>
          </table>
        </div>

        {!loading && rows && rows.length > 0 && (
          <PaginationBar
            page={page}
            perPage={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            goto={goto}
            setPage={setPage}
            setGoto={setGoto}
            onGoto={onGoto}
          />
        )}
      </div>
    </div>
  );
}

export default Reconciliation;
