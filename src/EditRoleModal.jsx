import { useState, useEffect } from 'react';
import api from './api/axios';
import { validateRoleName, validateDescription } from './validation';
import './Users.css';
import './AddUser.css';
import './EditUser.css';
import './AddRoleModal.css';

function EditRoleModal({ roleId, onClose, onSuccess }) {
  // ── Form fields ───────────────────────────────────────────────────────────
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');

  // ── Permission data ───────────────────────────────────────────────────────
  const [allPermissions, setAllPermissions] = useState([]);
  const [selected,       setSelected]       = useState([]);

  // ── Search inputs ─────────────────────────────────────────────────────────
  const [availableSearch, setAvailableSearch] = useState('');
  const [selectedSearch,  setSelectedSearch]  = useState('');

  // ── Checkbox selection state (Set of ids) ─────────────────────────────────
  const [checkedAvailable, setCheckedAvailable] = useState(new Set());
  const [checkedSelected,  setCheckedSelected]  = useState(new Set());

  // ── Async / UI state ──────────────────────────────────────────────────────
  const [loadingData, setLoadingData] = useState(true);
  const [error,       setError]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // Per-field inline errors + blur tracking. See src/validation.js for the pattern.
  const [fieldErrors,   setFieldErrors]   = useState({});
  const [touched,       setTouched]       = useState(new Set());
  // Set to true on the first Save attempt so the permissions warning appears.
  const [saveAttempted, setSaveAttempted] = useState(false);

  // ── Fetch permissions catalog + role data in parallel on mount ────────────
  useEffect(() => {
    (async () => {
      try {
        const [permsRes, roleRes] = await Promise.all([
          api.get('/admin/v1/permissions', { params: { grouped: true } }),
          api.get(`/admin/v1/roles/${roleId}`),
        ]);

        const items = permsRes.data?.data?.items ?? [];
        const sorted = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setAllPermissions(sorted);

        const role = roleRes.data?.data?.role;
        setName(role.name ?? '');
        setDescription(role.description ?? '');
        // Pre-fill selected with the role's current permissions, preserving
        // the catalog sort order so the right-hand list is consistently ordered.
        const rolePermIds = new Set((role.permissions ?? []).map((p) => p.id));
        setSelected(sorted.filter((p) => rolePermIds.has(p.id)));
      } catch {
        setError('Failed to load role data. Please close and try again.');
      } finally {
        setLoadingData(false);
      }
    })();
  }, [roleId]);

  // ── Derived lists (computed, not stored) ──────────────────────────────────
  const selectedIds = new Set(selected.map((p) => p.id));
  const available   = allPermissions.filter((p) => !selectedIds.has(p.id));

  const filteredAvailable = available.filter((p) =>
    p.label.toLowerCase().includes(availableSearch.toLowerCase())
  );
  const filteredSelected = selected.filter((p) =>
    p.label.toLowerCase().includes(selectedSearch.toLowerCase())
  );

  // ── Checkbox toggle helpers ───────────────────────────────────────────────
  function toggleAvailable(id) {
    setCheckedAvailable((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelected(id) {
    setCheckedSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Transfer operations ───────────────────────────────────────────────────
  function moveRight() {
    const toMove = available.filter((p) => checkedAvailable.has(p.id));
    if (!toMove.length) return;
    setSelected((prev) => [...prev, ...toMove]);
    setCheckedAvailable(new Set());
  }

  function moveAllRight() {
    if (!available.length) return;
    setSelected((prev) => [...prev, ...available]);
    setCheckedAvailable(new Set());
  }

  function moveLeft() {
    setSelected((prev) => prev.filter((p) => !checkedSelected.has(p.id)));
    setCheckedSelected(new Set());
  }

  function moveAllLeft() {
    setSelected([]);
    setCheckedSelected(new Set());
  }

  // Returns the current error for every validated field (null = valid).
  // Accepts overrides so handleBlur can pass the DOM's current value directly,
  // sidestepping the stale-closure issue described in src/validation.js.
  function validate(overrides = {}) {
    return {
      name:        validateRoleName(overrides.name               ?? name),
      description: validateDescription(overrides.description     ?? description),
    };
  }

  function handleBlur(field, value) {
    setTouched(prev => new Set(prev).add(field));
    const errors = validate({ [field]: value });
    setFieldErrors(prev => ({ ...prev, [field]: errors[field] }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveAttempted(true);

    // Validate name and description; block if either fails.
    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setTouched(new Set(Object.keys(errors)));
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await api.patch(`/admin/v1/roles/${roleId}`, {
        name:          name.trim(),
        description:   description.trim() || undefined,
        permissionIds: selected.map((p) => p.id),
      });
      onSuccess();
    } catch (err) {
      const code    = err.response?.data?.error?.code;
      const message = err.response?.data?.error?.message;
      if (err.response?.status === 403 && code === 'PRIVILEGE_ESCALATION') {
        setError('Only an ADMIN can modify this role.');
      } else {
        setError(message ?? 'Failed to update role.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="add-role-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="add-role-modal">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="add-role-header">Edit Role</div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="add-role-body">

          {/* Name + Description side-by-side */}
          <div className="add-role-top-row">
            <div className="filter-group">
              <label htmlFor="er-name">Name</label>
              <input
                id="er-name"
                type="text"
                className="filter-input adduser-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => handleBlur('name', e.target.value)}
              />
              {touched.has('name') && fieldErrors.name && (
                <span className="field-error">{fieldErrors.name}</span>
              )}
            </div>
            <div className="filter-group">
              <label htmlFor="er-description">Description</label>
              <input
                id="er-description"
                type="text"
                className="filter-input adduser-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={(e) => handleBlur('description', e.target.value)}
              />
              {touched.has('description') && fieldErrors.description && (
                <span className="field-error">{fieldErrors.description}</span>
              )}
            </div>
          </div>

          {/* API error banner (e.g. duplicate name, privilege escalation) */}
          {error && <div className="add-role-error">{error}</div>}

          {/* ── Dual listbox ─────────────────────────────────────────── */}
          {loadingData ? (
            <p style={{ color: '#777', fontFamily: 'Arial', fontSize: '13px', margin: 0 }}>
              Loading…
            </p>
          ) : (
            <div className="duallist-container">

              {/* LEFT — Available */}
              <div className="duallist-box">
                <div className="duallist-label">Available</div>
                <input
                  type="text"
                  className="duallist-search"
                  placeholder="Search..."
                  value={availableSearch}
                  onChange={(e) => setAvailableSearch(e.target.value)}
                />
                <div className="duallist-list">
                  {filteredAvailable.length === 0 ? (
                    <div className="duallist-empty">
                      {available.length === 0 ? 'All permissions selected' : 'No matches'}
                    </div>
                  ) : (
                    filteredAvailable.map((p) => (
                      <label key={p.id} className="duallist-item">
                        <input
                          type="checkbox"
                          checked={checkedAvailable.has(p.id)}
                          onChange={() => toggleAvailable(p.id)}
                        />
                        {p.label}
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* MIDDLE — transfer buttons */}
              <div className="duallist-controls">
                <button
                  className="btn-transfer"
                  onClick={moveRight}
                  disabled={checkedAvailable.size === 0}
                  title="Move checked items to Selected"
                >
                  {'>'}
                </button>
                <button
                  className="btn-transfer"
                  onClick={moveAllRight}
                  disabled={available.length === 0}
                  title="Move all available to Selected"
                >
                  {'>>'}
                </button>
                <button
                  className="btn-transfer"
                  onClick={moveLeft}
                  disabled={checkedSelected.size === 0}
                  title="Move checked items back to Available"
                >
                  {'<'}
                </button>
                <button
                  className="btn-transfer"
                  onClick={moveAllLeft}
                  disabled={selected.length === 0}
                  title="Move all selected back to Available"
                >
                  {'<<'}
                </button>
              </div>

              {/* RIGHT — Selected */}
              <div className="duallist-box">
                <div className="duallist-label">Selected</div>
                <input
                  type="text"
                  className="duallist-search"
                  placeholder="Search..."
                  value={selectedSearch}
                  onChange={(e) => setSelectedSearch(e.target.value)}
                />
                <div className="duallist-list">
                  {filteredSelected.length === 0 ? (
                    <div className="duallist-empty">
                      {selected.length === 0 ? 'No permissions selected' : 'No matches'}
                    </div>
                  ) : (
                    filteredSelected.map((p) => (
                      <label key={p.id} className="duallist-item">
                        <input
                          type="checkbox"
                          checked={checkedSelected.has(p.id)}
                          onChange={() => toggleSelected(p.id)}
                        />
                        {p.label}
                      </label>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="add-role-footer">
          {/*
           * Soft warning — only shown after the first Save attempt.
           * Zero-permission roles are not blocked (a placeholder role or one
           * whose permissions haven't been decided yet is a valid use case),
           * but in a finance admin app this is almost always unintentional.
           */}
          {saveAttempted && selected.length === 0 && (
            <span className="field-warning" style={{ marginRight: 'auto' }}>
              No permissions selected — users assigned this role won&apos;t have any access.
            </span>
          )}
          <button className="btn-cancel" onClick={onClose} disabled={submitting}>
            CANCEL
          </button>
          <button
            className="btn-adduser"
            onClick={handleSave}
            disabled={submitting || loadingData}
          >
            {submitting ? 'SAVING…' : 'SAVE'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default EditRoleModal;
