import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import { hasPermission } from './auth';
import './IsinMaster.css';
import './Users.css';

const DATA_COLUMNS = [
  'ID', 'NAME', 'USER NAME', 'EMAIL', 'ROLE',
  'CREATED BY', 'CREATED ON', 'UPDATED BY', 'UPDATED ON',
];

// Trim ISO timestamps (e.g. "2024-01-15T10:30:00Z") down to "2024-01-15" for display.
function formatDate(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

function Users() {
  const navigate = useNavigate();

  // ── Permission flags (read once per render from localStorage) ─────────────
  const canCreate = hasPermission('user:create');
  const canUpdate = hasPermission('user:update');
  // Only show the ACTIONS column when there's at least one action to show.
  const columns = canUpdate ? ['ACTIONS', ...DATA_COLUMNS] : DATA_COLUMNS;

  // ── Filter input state (bound to the form fields) ─────────────────────────
  const [id,          setId]          = useState('');
  const [username,    setUsername]    = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo,   setCreatedTo]   = useState('');

  // ── Pagination state ──────────────────────────────────────────────────────
  const [page,    setPage]    = useState(1);
  const [perPage, setPerPage] = useState(5);

  /*
   * appliedFilters holds only the params that should be sent to the API.
   * It is set on SEARCH (and cleared on RESET) rather than on every keystroke,
   * so the fetch only re-runs when the user explicitly submits, not while typing.
   *
   * Because React's useEffect dependency check uses Object.is() (reference
   * equality), every setAppliedFilters call — even with identical values —
   * produces a new object reference and therefore triggers a re-fetch. This
   * is intentional: the user clicking SEARCH expects a fresh result.
   */
  const [appliedFilters, setAppliedFilters] = useState({});

  // ── Data / async state ────────────────────────────────────────────────────
  const [users,      setUsers]      = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  /*
   * ── Why Users needs two endpoints while Roles only needs one ────────────
   *
   * The Roles API bakes filtering directly into its list endpoint:
   *   GET /admin/v1/roles?id=&name=&createdFrom=&createdTo=&page=&pageSize=
   * The frontend can always hit one URL and just include or omit the optional
   * query params — no branching needed.
   *
   * The Users API exposes two separate endpoints:
   *   GET /admin/v1/users              — paginated list, no filter support
   *   GET /admin/v1/users/search       — same pagination + id/username/
   *                                      createdFrom/createdTo filter params
   *
   * The list endpoint was designed first and has no filter support; the search
   * endpoint was added later with multi-field filtering. Rather than break the
   * existing list contract, the backend kept them separate.
   *
   * Rule applied here:
   *   • Any filter field filled in → call /users/search with those params
   *   • All filter fields empty    → call /users (the plain paginated list)
   *
   * Both endpoints return the same response shape:
   *   { success, data: { items, page, pageSize, totalCount, totalPages } }
   * so pagination wiring is identical regardless of which was called.
   * ────────────────────────────────────────────────────────────────────────
   *
   * ── Why page, perPage, AND appliedFilters are all in the dependency array ─
   *
   * useEffect re-runs whenever any value in the array changes:
   *
   *   page           — clicking a page button changes page → re-fetch the
   *                    correct page number.
   *   perPage        — changing "Entries per page" → re-fetch with new pageSize
   *                    (page also resets to 1, firing a second change).
   *   appliedFilters — clicking SEARCH or RESET replaces this object reference
   *                    → re-fetch with the new filter params (or no params on
   *                    RESET, which falls back to the plain list endpoint).
   *
   * Leaving the array empty ([]) would freeze the data at the initial fetch:
   * React would never see a "changed" dependency and would skip every
   * subsequent re-run, ignoring all user interaction.
   * ────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const hasFilters = Object.keys(appliedFilters).length > 0;
        let res;
        if (hasFilters) {
          // At least one filter is set — use the dedicated search endpoint.
          res = await api.get('/admin/v1/users/search', {
            params: { page, pageSize: perPage, ...appliedFilters },
          });
        } else {
          // No filters — use the plain paginated list endpoint.
          res = await api.get('/admin/v1/users', {
            params: { page, pageSize: perPage },
          });
        }
        const { items, totalCount, totalPages } = res.data.data;
        setUsers(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        setFetchError('Failed to load users. Please try again.');
        setUsers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, perPage, appliedFilters]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    // Only include fields that have a value — omit empty strings from the query.
    setAppliedFilters({
      ...(id          && { id }),
      ...(username    && { username }),
      ...(createdFrom && { createdFrom }),
      ...(createdTo   && { createdTo }),
    });
  }

  function handleReset() {
    setId('');
    setUsername('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
    setAppliedFilters({}); // empty object → re-fetch falls back to plain list endpoint
  }

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1); // always go back to page 1 when the page size changes
  }

  // "Showing X to Y of Z entries"
  const firstEntry = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const lastEntry  = Math.min(page * perPage, totalCount);

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  return (
    <div className="isin-master">
      <h1 className="page-heading">User</h1>

      {/* ══════════════════════════════════════════════
          TOP CARD — header + filter inputs + buttons
         ══════════════════════════════════════════════ */}
      <div className="im-card">

        <div className="im-card-header">
          <span>Users</span>
          {canCreate && (
            <button className="btn-upload" onClick={() => navigate('/user-management/users/add')}>
              + ADD USER
            </button>
          )}
        </div>

        {/*
         * Two-row filter layout:
         *   Row 1 — four inputs with floating labels
         *   Row 2 — SEARCH and RESET action buttons
         */}
        <form className="user-filter" onSubmit={handleSearch}>

          <div className="user-filter-fields">

            <div className="filter-group">
              <label htmlFor="filterId">ID</label>
              <input
                id="filterId"
                type="text"
                className="filter-input"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filterUsername">Username</label>
              <input
                id="filterUsername"
                type="text"
                className="filter-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filterCreatedFrom">Created From</label>
              <input
                id="filterCreatedFrom"
                type="date"
                className="filter-input filter-input--date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="filterCreatedTo">Created To</label>
              <input
                id="filterCreatedTo"
                type="date"
                className="filter-input filter-input--date"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>

          </div>

          <div className="user-filter-actions">
            <button type="submit" className="btn-action btn-action--pink">SEARCH</button>
            <button type="button" className="btn-action btn-action--white" onClick={handleReset}>
              RESET
            </button>
          </div>

        </form>
      </div>

      {/* ══════════════════════════════════════════════
          BOTTOM CARD — table + pagination
         ══════════════════════════════════════════════ */}
      <div className="im-card">

        <div className="im-card-header">
          <span>Users List</span>
          <label className="entries-label">
            Entries per page
            <select
              className="entries-select"
              value={perPage}
              onChange={handlePerPageChange}
            >
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
              <tr>
                {columns.map((col) => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>

              {loading ? (
                <tr>
                  <td className="im-empty-state" colSpan={columns.length}>
                    Loading…
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td
                    className="im-empty-state"
                    colSpan={columns.length}
                    style={{ color: '#c0392b' }}
                  >
                    {fetchError}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={columns.length}>
                    {hasActiveFilters ? 'No users found matching the applied filters.' : 'No users found.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    {canUpdate && (
                      <td>
                        <button
                          className="btn-edit"
                          onClick={() => navigate(`/user-management/users/${user.id}/edit`)}
                        >
                          EDIT
                        </button>
                      </td>
                    )}
                    <td>{user.id}</td>
                    <td>{user.name}</td>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{user.role?.name ?? '—'}</td>
                    <td>{user.createdBy ?? '—'}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.updatedBy ?? '—'}</td>
                    <td>{formatDate(user.updatedAt)}</td>
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                className={`page-btn ${pageNum === page ? 'page-btn--active' : ''}`}
                onClick={() => setPage(pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Users;
