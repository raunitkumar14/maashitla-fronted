import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './Company.css';

const COLUMNS = [
  { header: 'ISIN', field: 'isin' },
];

function cell(row, field) {
  const v = row[field];
  return (v == null || v === '') ? '—' : v;
}

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
  }, [issuerCode, page, perPage]);

  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

  function handleIsinClick(isinRow) {
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

      <div className="im-card">
        <div className="im-card-header">
          <span>ISIN List</span>
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
              <tr>{COLUMNS.map(col => <th key={col.field}>{col.header}</th>)}</tr>
            </thead>
            <tbody>
              {(() => {
                const visible = isinFilter.trim()
                  ? isins.filter(r => (r.isin ?? '').toUpperCase().includes(isinFilter.trim().toUpperCase()))
                  : isins;
                if (loading) return (
                  <tr><td className="im-empty-state" colSpan={COLUMNS.length}>Loading…</td></tr>
                );
                if (visible.length === 0) return (
                  <tr>
                    <td className="im-empty-state" colSpan={COLUMNS.length}>
                      {isinFilter.trim() ? 'No ISINs match that filter.' : 'No ISINs found for this company.'}
                    </td>
                  </tr>
                );
                return visible.map((row, idx) => (
                  <tr
                    key={row.isin || idx}
                    className="ci-isin-row"
                    onClick={() => handleIsinClick(row)}
                    title="Open mini-dashboard for this ISIN"
                  >
                    {COLUMNS.map(col => (
                      <td key={col.field}>{cell(row, col.field)}</td>
                    ))}
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
    </div>
  );
}

export default CompanyIsins;
