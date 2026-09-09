import { useState, useEffect } from 'react';
import api from './api/axios';
import './IsinMaster.css';
import './Users.css';

const COLUMNS = ['USERNAME', 'LOGIN TIME', 'LOGOUT TIME', 'IP ADDRESS', 'STATUS'];

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function getPageNumbers(page, totalPages) {
  if (totalPages <= 6) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set([1, 2, page - 1, page, page + 1, totalPages]);
  return Array.from(set)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
}

function buildPageButtons(pageNumbers, page, totalPages, setPage) {
  const buttons = [];

  buttons.push(
    <button
      key="prev"
      className="page-btn"
      onClick={() => setPage((p) => Math.max(1, p - 1))}
      disabled={page === 1}
    >
      ‹
    </button>
  );

  let prev = null;
  for (const p of pageNumbers) {
    if (prev !== null && p - prev > 1) {
      buttons.push(<span key={`ellipsis-${p}`} className="page-ellipsis">…</span>);
    }
    buttons.push(
      <button
        key={p}
        className={`page-btn ${p === page ? 'page-btn--active' : ''}`}
        onClick={() => setPage(p)}
      >
        {p}
      </button>
    );
    prev = p;
  }

  buttons.push(
    <button
      key="next"
      className="page-btn"
      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
      disabled={page === totalPages || totalPages === 0}
    >
      ›
    </button>
  );

  return buttons;
}

function LoginHistoryList() {
  const [userId,    setUserId]    = useState('');
  const [loginFrom, setLoginFrom] = useState('');
  const [loginTo,   setLoginTo]   = useState('');

  const [users, setUsers] = useState([]);

  const [page,     setPage]     = useState(1);
  const [perPage,  setPerPage]  = useState(5);
  const [gotoPage, setGotoPage] = useState('');

  const [appliedFilters, setAppliedFilters] = useState({});

  const [history,    setHistory]    = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    api.get('/admin/v1/users', { params: { page: 1, pageSize: 1000 } })
      .then((res) => setUsers(res.data.data?.items ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get('/admin/v1/login-history', {
          params: { page, pageSize: perPage, ...appliedFilters },
        });
        const { items, totalCount, totalPages } = res.data.data;
        setHistory(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        setFetchError('Failed to load login history. Please try again.');
        setHistory([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, perPage, appliedFilters]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setAppliedFilters({
      ...(userId    && { userId }),
      ...(loginFrom && { loginFrom }),
      ...(loginTo   && { loginTo }),
    });
  }

  function handleReset() {
    setUserId('');
    setLoginFrom('');
    setLoginTo('');
    setPage(1);
    setAppliedFilters({});
  }

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  function handleGotoKeyDown(e) {
    if (e.key === 'Enter') {
      const n = parseInt(gotoPage, 10);
      if (n >= 1 && n <= totalPages) setPage(n);
    }
  }

  const firstEntry = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const lastEntry  = Math.min(page * perPage, totalCount);
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="isin-master">
      <h1 className="page-heading">Login History</h1>

      {/* ── Filter card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>Login History</span>
        </div>

        <form className="user-filter" onSubmit={handleSearch}>
          <div className="user-filter-fields">

            <div className="filter-group">
              <label htmlFor="filterUser">User</label>
              <select
                id="filterUser"
                className="filter-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">All</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="filterLoginFrom">Login From</label>
              <input
                id="filterLoginFrom"
                type="date"
                className="filter-input filter-input--date"
                value={loginFrom}
                onChange={(e) => setLoginFrom(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filterLoginTo">Login To</label>
              <input
                id="filterLoginTo"
                type="date"
                className="filter-input filter-input--date"
                value={loginTo}
                onChange={(e) => setLoginTo(e.target.value)}
              />
            </div>

          </div>

          <div className="user-filter-actions">
            <button type="submit" className="btn-action btn-action--pink">🔍 SEARCH</button>
            <button type="button" className="btn-action btn-action--white" onClick={handleReset}>
              RESET
            </button>
          </div>
        </form>
      </div>

      {/* ── History table card ── */}
      <div className="im-card">
        <div className="im-card-header">
          <span>History</span>
          <label className="entries-label">
            Entries per page
            <select className="entries-select" value={perPage} onChange={handlePerPageChange}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>{COLUMNS.map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="im-empty-state" colSpan={COLUMNS.length}>Loading…</td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td className="im-empty-state" colSpan={COLUMNS.length} style={{ color: '#c0392b' }}>
                    {fetchError}
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={COLUMNS.length}>
                    No login history found.
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.user?.username ?? entry.email}</td>
                    <td>{formatDateTime(entry.loginAt)}</td>
                    <td>{formatDateTime(entry.logoutAt)}</td>
                    <td>{entry.ipAddress}</td>
                    <td>
                      <span style={{
                        color: entry.status === 'SUCCESS' ? '#27ae60' : '#c0392b',
                        fontWeight: 600,
                      }}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="im-pagination">
          <span className="pagination-info">
            {totalCount === 0
              ? 'Showing 0 entries'
              : `Showing ${firstEntry} to ${lastEntry} of ${totalCount} entries`}
          </span>

          <div className="pagination-controls">
            {buildPageButtons(pageNumbers, page, totalPages, setPage)}
            <span className="goto-label">Go to:</span>
            <input
              className="goto-input"
              type="number"
              min={1}
              max={totalPages || 1}
              value={gotoPage}
              onChange={(e) => setGotoPage(e.target.value)}
              onKeyDown={handleGotoKeyDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginHistoryList;
