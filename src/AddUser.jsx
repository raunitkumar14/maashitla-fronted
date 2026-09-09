import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import api from './api/axios';
import { hasPermission } from './auth';
import {
  validateName,
  validateUsername,
  validateEmail,
  validatePassword,
  validateRoleSelection,
  validateMobile,
} from './validation';
import './IsinMaster.css';
import './Users.css';
import './AddUser.css';

/*
 * ── useEffect and the fetch-on-mount pattern ────────────────────────────────
 *
 * useEffect(() => { ... }, []) is React's way of saying "run this side-effect
 * once, right after the component first appears on screen."
 *
 * The second argument — the dependency array [] — controls when the effect
 * re-runs. An empty array means "only on mount, never again." If you put a
 * variable in it (e.g. [userId]), the effect re-runs whenever that variable
 * changes.
 *
 * The callback cannot itself be async (React expects it to return either
 * nothing or a cleanup function, not a Promise), so the standard pattern is
 * to declare an async IIFE (immediately-invoked function expression) inside
 * and call it right away:
 *
 *   useEffect(() => {
 *     (async () => {
 *       const res = await api.get('/some-endpoint');
 *       setData(res.data);
 *     })();
 *   }, []);
 *
 * This is equivalent to "fetch roles when the page loads" — the same thing
 * you'd do with document.addEventListener('DOMContentLoaded', ...) in plain JS.
 * ────────────────────────────────────────────────────────────────────────────
 */

function AddUser() {
  const navigate = useNavigate();

  // Guard: redirect users who lack create permission before rendering anything.
  if (!hasPermission('user:create')) {
    return <Navigate to="/user-management/users" replace />;
  }

  // ── Form field state ──────────────────────────────────────────────────────
  const [name,     setName]     = useState('');
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [roleId,   setRoleId]   = useState('');
  const [userType, setUserType] = useState('');
  const [mobile,   setMobile]   = useState('');
  const [status,   setStatus]   = useState('ACTIVE');

  // ── UI / async state ──────────────────────────────────────────────────────
  const [roles,          setRoles]          = useState([]);
  const [rolesLoading,   setRolesLoading]   = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [errorMessage,   setErrorMessage]   = useState('');   // top-of-form API errors
  const [successMessage, setSuccessMessage] = useState('');

  // Per-field inline errors + blur tracking. See src/validation.js for the
  // full pattern — every form in this project follows the same 3-step approach.
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched,     setTouched]     = useState(new Set());

  // ── Fetch roles on mount ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/v1/roles');
        // Response shape: { success: true, data: { items: [...] } }
        const list = res.data?.data?.items ?? [];
        setRoles(list);
      } catch {
        setErrorMessage('Failed to load roles. Please refresh the page.');
      } finally {
        setRolesLoading(false);
      }
    })();
  }, []);

  // Returns the current error for every validated field (null = valid).
  // Accepts overrides so handleBlur can pass the DOM's current value directly,
  // sidestepping the stale-closure issue described in src/validation.js.
  function validate(overrides = {}) {
    return {
      name:     validateName(overrides.name         ?? name),
      username: validateUsername(overrides.username ?? username),
      email:    validateEmail(overrides.email       ?? email),
      password: validatePassword(overrides.password ?? password),
      roleId:   validateRoleSelection(overrides.roleId ?? roleId),
      mobile:   validateMobile(overrides.mobile     ?? mobile),
    };
  }

  function handleBlur(field, value) {
    setTouched(prev => new Set(prev).add(field));
    const errors = validate({ [field]: value });
    setFieldErrors(prev => ({ ...prev, [field]: errors[field] }));
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    // Validate all fields; show every error before making any API call.
    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setTouched(new Set(Object.keys(errors)));
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/v1/users', {
        name:     name.trim(),
        username: username.trim(),
        email:    email.trim(),
        password,
        roleId:   Number(roleId),
        userType: userType      || undefined,
        mobile:   mobile.trim() || undefined,
        status:   status        || undefined,
      });

      setSuccessMessage('User created successfully!');
      // Navigate back after a brief moment so the user can read the confirmation.
      setTimeout(() => navigate('/user-management/users'), 1500);
    } catch (error) {
      const code    = error.response?.data?.error?.code;
      const message = error.response?.data?.error?.message
        ?? 'Something went wrong. Please try again.';

      if (code === 'VAL_WEAK_PASSWORD') {
        // Inject the backend's password error directly below the password field.
        setFieldErrors(prev => ({ ...prev, password: message }));
        setTouched(prev => new Set(prev).add('password'));
      } else {
        setErrorMessage(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="isin-master">
      <h1 className="page-heading">Add</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>User Details</span>
        </div>

        {/*
         * noValidate disables browser constraint validation so our custom
         * inline messages (field-error spans) are the only validation shown.
         */}
        <form className="adduser-form" onSubmit={handleSubmit} noValidate>

          {/* Success banner — shown briefly before navigating away */}
          {successMessage && (
            <div className="adduser-success-banner">{successMessage}</div>
          )}

          {/* Top-of-form error banner — for API errors without a field mapping */}
          {errorMessage && (
            <div className="adduser-error-banner">{errorMessage}</div>
          )}

          {/*
           * 3-column grid layout:
           *
           *   Row 1: [Name]     [User Name]   [Email]
           *   Row 2: [Password] [Roles....................(span 2)]
           *   Row 3: [Mobile]   [User Type]   [Status]
           *   Row 4:         [ADD USER] (centred, span 3)
           */}
          <div className="adduser-grid">

            {/* ── Row 1 ─────────────────────────────────────────────── */}

            <div className="filter-group">
              <label htmlFor="au-name">Name</label>
              <input
                id="au-name"
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
              <label htmlFor="au-username">User Name</label>
              <input
                id="au-username"
                type="text"
                className="filter-input adduser-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={(e) => handleBlur('username', e.target.value)}
              />
              {touched.has('username') && fieldErrors.username && (
                <span className="field-error">{fieldErrors.username}</span>
              )}
            </div>

            <div className="filter-group">
              <label htmlFor="au-email">Email</label>
              <input
                id="au-email"
                type="email"
                className="filter-input adduser-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleBlur('email', e.target.value)}
              />
              {touched.has('email') && fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>

            {/* ── Row 2 ─────────────────────────────────────────────── */}

            <div className="filter-group">
              <label htmlFor="au-password">Password</label>
              <input
                id="au-password"
                type="password"
                className="filter-input adduser-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => handleBlur('password', e.target.value)}
              />
              {touched.has('password') && fieldErrors.password && (
                <span className="field-error">{fieldErrors.password}</span>
              )}
            </div>

            {/* Roles: cols 2-3 (span 2). Populated from GET /api/admin/v1/roles. */}
            <div className="filter-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="au-roleId">Roles</label>
              <select
                id="au-roleId"
                className="filter-input adduser-input adduser-select"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                onBlur={(e) => handleBlur('roleId', e.target.value)}
                disabled={rolesLoading}
              >
                <option value="">
                  {rolesLoading ? 'Loading roles…' : 'Select a role'}
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {touched.has('roleId') && fieldErrors.roleId && (
                <span className="field-error">{fieldErrors.roleId}</span>
              )}
            </div>

            {/* ── Row 3 ─────────────────────────────────────────────── */}

            <div className="filter-group">
              <label htmlFor="au-mobile">Mobile</label>
              <input
                id="au-mobile"
                type="text"
                className="filter-input adduser-input"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                onBlur={(e) => handleBlur('mobile', e.target.value)}
              />
              {touched.has('mobile') && fieldErrors.mobile && (
                <span className="field-error">{fieldErrors.mobile}</span>
              )}
            </div>

            <div className="filter-group">
              <label htmlFor="au-userType">User Type</label>
              <select
                id="au-userType"
                className="filter-input adduser-input adduser-select"
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
              >
                <option value="">Select</option>
                <option value="ADMIN">ADMIN</option>
                <option value="EMPLOYEE">EMPLOYEE</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="au-status">Status</label>
              <select
                id="au-status"
                className="filter-input adduser-input adduser-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            {/* ── Row 4: submit ─────────────────────────────────────── */}

            <div className="adduser-submit-row">
              <button
                type="submit"
                className="btn-adduser"
                disabled={submitting || !!successMessage}
              >
                {submitting ? 'ADDING…' : 'ADD USER'}
              </button>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}

export default AddUser;
