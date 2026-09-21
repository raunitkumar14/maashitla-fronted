import { useState, useEffect } from 'react';
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
  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page,            setPage]            = useState(1);
  const [perPage,         setPerPage]         = useState(10);
  const [goto,            setGoto]            = useState('');

  const [issuers,    setIssuers]    = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Debounce: wait 400 ms after the user stops typing before sending a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const params = { page, pageSize: perPage };
        if (debouncedSearch) params.issuerCode = debouncedSearch;
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
  }, [page, perPage, debouncedSearch]);

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  function handleGoto() {
    const target = parseInt(goto, 10);
    if (!isNaN(target) && target >= 1 && target <= totalPages) setPage(target);
    setGoto('');
  }

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

        <div className="company-search-row">
          <input
            className="im-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
                <th>Total ISIN</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="im-empty-state" colSpan={5}>Loading…</td>
                </tr>
              ) : issuers.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={5}>No data available.</td>
                </tr>
              ) : (
                issuers.map((row, idx) => (
                  <tr key={row.issuerCode || idx}>
                    <td>{row.issuerId ?? '—'}</td>
                    <td>{row.issuerCode}</td>
                    <td>{row.totalIsin}</td>
                    <td>{row.source}</td>
                    <td className="company-action-cell">
                      <button className="company-icon-btn" title="View">→</button>
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
