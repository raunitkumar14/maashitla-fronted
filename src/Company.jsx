import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './Company.css';

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
        {totalCount === 0
          ? 'Showing 0 entries'
          : `Showing ${first} to ${last} of ${totalCount} entries`}
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
          max={totalPages}
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

function Company() {
  const navigate = useNavigate();

  // ── Search input state (not applied until SEARCH is clicked) ─────────────
  const [issuerId,   setIssuerId]   = useState('');
  const [issuerCode, setIssuerCode] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [source,     setSource]     = useState('');

  // ── Committed filters — only updated on SEARCH / RESET ───────────────────
  const [appliedFilters, setAppliedFilters] = useState({
    issuerId: '', issuerCode: '', issuerName: '', source: '',
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  const [page,   setPage]   = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [goto,    setGoto]   = useState('');

  // ── Table data ────────────────────────────────────────────────────────────
  const [issuers,    setIssuers]    = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ── Fetch: runs when page, perPage, or committed filters change ───────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const params = { page, pageSize: perPage };
        if (appliedFilters.issuerId)   params.issuerId   = appliedFilters.issuerId;
        if (appliedFilters.issuerCode) params.issuerCode = appliedFilters.issuerCode;
        if (appliedFilters.issuerName) params.issuerName = appliedFilters.issuerName;
        if (appliedFilters.source)     params.source     = appliedFilters.source;
        const res = await api.get('/admin/v1/issuers', { params });
        if (cancelled) return;
        const { items, totalCount, totalPages } = res.data.data;
        setIssuers(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        if (!cancelled) {
          setFetchError('Failed to load companies. Please try again.');
          setIssuers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [page, perPage, appliedFilters]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

  function handleSearch(e) {
    e.preventDefault();
    setAppliedFilters({
      issuerId:   issuerId.trim(),
      issuerCode: issuerCode.trim(),
      issuerName: issuerName.trim(),
      source:     source.trim(),
    });
    setPage(1);
  }

  function handleReset() {
    setIssuerId('');
    setIssuerCode('');
    setIssuerName('');
    setSource('');
    setAppliedFilters({ issuerId: '', issuerCode: '', issuerName: '', source: '' });
    setPage(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">Company</h1>

      {/* ── Right-aligned action row ── */}
      <div className="company-action-row">
        <button className="btn-action btn-action--white">
          ⬇ Sample
        </button>
        <button className="btn-action btn-action--grey" disabled>
          UPLOAD DENIED
        </button>
        <button className="btn-action btn-action--pink">
          + ADD COMPANY
        </button>
      </div>

      {/* ── Company List card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Company List</span>
          <label className="entries-label">
            Entries per page
            <select className="entries-select" value={perPage} onChange={handlePerPageChange}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>

        <form className="im-filter-row" onSubmit={handleSearch}>
          <input
            className="im-input im-input--wide"
            placeholder="Issuer ID"
            value={issuerId}
            onChange={(e) => setIssuerId(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Issuer Code"
            value={issuerCode}
            onChange={(e) => setIssuerCode(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Issuer Name"
            value={issuerName}
            onChange={(e) => setIssuerName(e.target.value)}
          />
          <input
            className="im-input im-input--wide"
            placeholder="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <button type="submit"  className="btn-action btn-action--pink">&#128269; SEARCH</button>
          <button type="button"  className="btn-action btn-action--white" onClick={handleReset}>RESET</button>
        </form>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {fetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                <th>Issuer ID</th>
                <th>Issuer Code</th>
                <th>Issuer Name</th>
                <th>Total ISIN</th>
                <th>Source</th>
                <th>More Information</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="im-empty-state" colSpan={6}>Loading…</td>
                </tr>
              ) : issuers.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={6}>No data available.</td>
                </tr>
              ) : (
                issuers.map((row, idx) => (
                  <tr key={row.issuerCode || idx}>
                    <td>{row.issuerId ?? '—'}</td>
                    <td>{row.issuerCode}</td>
                    <td>{row.issuerName || '—'}</td>
                    <td>{row.totalIsin}</td>
                    <td>{row.source}</td>
                    <td className="company-action-cell">
                      <button
                        className="company-icon-btn"
                        title="View Details"
                        onClick={() => navigate(`/company/${row.issuerCode}/details`)}
                      >
                        →
                      </button>
                      <button className="company-icon-btn" title="Edit">✏</button>
                    </td>
                  </tr>
                ))
              )}
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

export default Company;
