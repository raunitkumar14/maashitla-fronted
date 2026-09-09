import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api/axios';
import { hasPermission } from './auth';
import AddRoleModal from './AddRoleModal';
import EditRoleModal from './EditRoleModal';
import './IsinMaster.css';
import './Users.css';
import './AddUser.css';

const DATA_COLUMNS = [
  'ID', 'NAME', 'DESCRIPTION',
  'CREATED BY', 'CREATED ON',
  'UPDATED BY', 'UPDATED ON',
];

function formatDate(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

function Roles() {
  const navigate = useNavigate();

  // ── Permission flags (read once per render from localStorage) ─────────────
  const canCreate = hasPermission('role:create');
  const canUpdate = hasPermission('role:update');
  const columns = canUpdate ? [...DATA_COLUMNS, 'ACTION'] : DATA_COLUMNS;

  // ── Filter input state (bound to the form fields) ─────────────────────────
  const [id,          setId]          = useState('');
  const [name,        setName]        = useState('');
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
  const [roles,      setRoles]      = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState('');

  // ── Modal + post-save feedback ────────────────────────────────────────────
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [editRoleId,      setEditRoleId]      = useState(null);
  const [successMessage,  setSuccessMessage]  = useState('');
  // Incrementing refreshKey re-runs the fetch useEffect without changing
  // page/perPage/filters — it's the simplest way to force a table reload
  // after a role is created without duplicating the fetch logic.
  const [refreshKey, setRefreshKey] = useState(0);

  /*
   * ── Why page, perPage, AND appliedFilters are all in the dependency array ─
   *
   * useEffect re-runs whenever any value in the array changes:
   *
   *   page           — clicking a page button increments/sets page → re-fetch
   *                    with the new page number.
   *   perPage        — changing "Entries per page" → re-fetch with new pageSize
   *                    (page also resets to 1, firing a second change).
   *   appliedFilters — clicking SEARCH or RESET replaces this object reference
   *                    → re-fetch with the new filter params (or no params on
   *                    RESET). Omitting it would mean filters have no effect.
   *
   * Leaving the array empty ([]) would freeze the data at the initial fetch:
   * React would never see a "changed" dependency and would skip every
   * subsequent re-run, ignoring all user interaction.
   * ─────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get('/admin/v1/roles', {
          params: { page, pageSize: perPage, ...appliedFilters },
        });
        const { items, totalCount, totalPages } = res.data.data;
        setRoles(items);
        setTotalCount(totalCount);
        setTotalPages(totalPages);
      } catch {
        setFetchError('Failed to load roles. Please try again.');
        setRoles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [page, perPage, appliedFilters, refreshKey]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    // Only include fields that have a value — omit empty strings from the query.
    setAppliedFilters({
      ...(id          && { id }),
      ...(name        && { name }),
      ...(createdFrom && { createdFrom }),
      ...(createdTo   && { createdTo }),
    });
  }

  function handleReset() {
    setId('');
    setName('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
    setAppliedFilters({}); // empty object → re-fetch with no filter params
  }

  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  function handleRoleAdded() {
    setShowAddModal(false);
    setRefreshKey((k) => k + 1);
    setSuccessMessage('Role created successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  }

  function handleRoleEdited() {
    setEditRoleId(null);
    setRefreshKey((k) => k + 1);
    setSuccessMessage('Role updated successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  }

  const firstEntry = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const lastEntry  = Math.min(page * perPage, totalCount);

  return (
    <div className="isin-master">
      <h1 className="page-heading">Role</h1>

      {successMessage && (
        <div className="adduser-success-banner">{successMessage}</div>
      )}

      {/* ══════════════════════════════════════════════
          TOP CARD — header + filter inputs + buttons
         ══════════════════════════════════════════════ */}
      <div className="im-card">

        <div className="im-card-header">
          <span>Roles</span>
          {canCreate && (
            <button className="btn-upload" onClick={() => setShowAddModal(true)}>
              + ADD ROLE
            </button>
          )}
        </div>

        <form className="user-filter" onSubmit={handleSearch}>

          <div className="user-filter-fields">

            <div className="filter-group">
              <label htmlFor="roleFilterId">ID</label>
              <input
                id="roleFilterId"
                type="text"
                className="filter-input"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="roleFilterName">Name</label>
              <input
                id="roleFilterName"
                type="text"
                className="filter-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="roleFilterFrom">Created From</label>
              <input
                id="roleFilterFrom"
                type="date"
                className="filter-input filter-input--date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label htmlFor="roleFilterTo">Created To</label>
              <input
                id="roleFilterTo"
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
          <span>Roles List</span>
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
              ) : roles.length === 0 ? (
                <tr>
                  <td className="im-empty-state" colSpan={columns.length}>
                    No roles found.
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id}>
                    <td>{role.id}</td>
                    <td>{role.name}</td>
                    <td>{role.description ?? '—'}</td>
                    <td>{role.createdBy  ?? '—'}</td>
                    <td>{formatDate(role.createdAt)}</td>
                    <td>{role.updatedBy  ?? '—'}</td>
                    <td>{formatDate(role.updatedAt)}</td>
                    {canUpdate && (
                      <td>
                        <button
                          className="btn-edit"
                          onClick={() => setEditRoleId(role.id)}
                        >
                          EDIT
                        </button>
                      </td>
                    )}
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

      {showAddModal && (
        <AddRoleModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleRoleAdded}
        />
      )}

      {editRoleId !== null && (
        <EditRoleModal
          roleId={editRoleId}
          onClose={() => setEditRoleId(null)}
          onSuccess={handleRoleEdited}
        />
      )}
    </div>
  );
}

export default Roles;
