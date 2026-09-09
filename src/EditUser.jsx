import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import api from './api/axios';
import { hasPermission } from './auth';
import {
  validateName,
  validateUsername,
  validateEmail,
  validateOptionalPassword,
  validateRoleSelection,
  validateMobile,
} from './validation';
import './IsinMaster.css';
import './Users.css';
import './AddUser.css';
import './EditUser.css';

/*
 * Why password changes use a separate endpoint from the general user update
 * (/set-password vs PATCH /users/:id):
 *
 * 1. Security isolation — passwords require specialised backend handling: hashing,
 *    strength enforcement, and audit logging. Bundling them into a generic PATCH
 *    would couple unrelated concerns and make it harder to apply different
 *    authorisation rules (e.g. requiring the current password for self-service
 *    changes vs. admin overrides).
 *
 * 2. Granular error reporting — if the user profile update succeeds but the
 *    password is rejected (e.g. too weak), we can surface exactly which action
 *    failed without rolling back the profile change. A single endpoint mixing
 *    both would either succeed or fail as a unit, which gives the user less
 *    actionable feedback.
 */

function EditUser() {
  const { userId }  = useParams();
  const navigate    = useNavigate();

  // Guard: redirect users who lack update permission before rendering anything.
  if (!hasPermission('user:update')) {
    return <Navigate to="/user-management/users" replace />;
  }

  // ── User detail fields ────────────────────────────────────────────────────
  const [name,     setName]     = useState('');
  const [username, setUsername] = useState('');
  const [email,    setEmail]    = useState('');
  const [roleId,   setRoleId]   = useState('');
  const [userType, setUserType] = useState('');
  const [mobile,   setMobile]   = useState('');
  const [status,   setStatus]   = useState('ACTIVE');

  // ── Password fields (optional — only sent if filled) ──────────────────────
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── UI / async state ──────────────────────────────────────────────────────
  const [roles,          setRoles]          = useState([]);
  const [loadingUser,    setLoadingUser]     = useState(true);
  const [loadingRoles,   setLoadingRoles]   = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [generalError,   setGeneralError]   = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Per-field inline errors + blur tracking. See src/validation.js for the
  // full pattern — every form in this project follows the same 3-step approach.
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched,     setTouched]     = useState(new Set());

  /*
   * originalRef stores the values fetched from the server so we can diff
   * them on submit and send only the fields that actually changed in the
   * PATCH body. We use a ref (not state) because the original values are
   * only needed during the submit handler — they never drive the UI directly,
   * so storing them in state would trigger an unnecessary re-render.
   */
  const originalRef = useRef(null);

  // ── Fetch user + roles on mount ───────────────────────────────────────────
  useEffect(() => {
    // Both fetches can run in parallel — neither depends on the other's result.
    Promise.all([
      api.get(`/admin/v1/users/${userId}`),
      api.get('/admin/v1/roles'),
    ])
      .then(([userRes, rolesRes]) => {
        const user = userRes.data?.data?.user ?? userRes.data?.data ?? {};
        const list = rolesRes.data?.data?.items ?? [];

        // Normalise nullish API values to empty strings for controlled inputs.
        const orig = {
          name:     user.name     ?? '',
          username: user.username ?? '',
          email:    user.email    ?? '',
          roleId:   String(user.role?.id ?? ''),
          userType: user.userType ?? '',
          mobile:   user.mobile   ?? '',
          status:   user.status   ?? 'ACTIVE',
        };

        originalRef.current = orig;

        setName(orig.name);
        setUsername(orig.username);
        setEmail(orig.email);
        setRoleId(orig.roleId);
        setUserType(orig.userType);
        setMobile(orig.mobile);
        setStatus(orig.status);
        setRoles(list);
      })
      .catch(() => {
        setGeneralError('Failed to load user data. Please refresh the page.');
      })
      .finally(() => {
        setLoadingUser(false);
        setLoadingRoles(false);
      });
  }, [userId]);

  // Returns the current error for every validated field (null = valid).
  // Accepts overrides so handleBlur can pass the DOM's current value directly,
  // sidestepping the stale-closure issue described in src/validation.js.
  function validate(overrides = {}) {
    const np = overrides.newPassword     !== undefined ? overrides.newPassword     : newPassword;
    const cp = overrides.confirmPassword !== undefined ? overrides.confirmPassword : confirmPassword;

    const confirmError = (() => {
      if (!np) return null; // password section is optional — skip when empty
      if (!cp) return 'Please confirm your new password.';
      if (cp !== np) return 'Passwords do not match.';
      return null;
    })();

    return {
      name:            validateName(overrides.name               ?? name),
      username:        validateUsername(overrides.username        ?? username),
      email:           validateEmail(overrides.email             ?? email),
      roleId:          validateRoleSelection(overrides.roleId    ?? roleId),
      mobile:          validateMobile(overrides.mobile           ?? mobile),
      newPassword:     validateOptionalPassword(np),
      confirmPassword: confirmError,
    };
  }

  function handleBlur(field, value) {
    setTouched(prev => new Set(prev).add(field));
    const errors = validate({ [field]: value });
    setFieldErrors(prev => {
      const next = { ...prev, [field]: errors[field] };
      // When newPassword changes, re-validate confirmPassword immediately so
      // the "Passwords do not match" error clears as soon as they sync.
      if (field === 'newPassword') {
        next.confirmPassword = errors.confirmPassword;
      }
      return next;
    });
  }

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setGeneralError('');

    // Validate all fields; show every error before making any API call.
    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      setTouched(new Set(Object.keys(errors)));
      return;
    }

    const wantsPasswordChange = newPassword !== '';

    // Diff against original values — only include genuinely changed fields
    // in the PATCH body so we don't accidentally overwrite data.
    const orig    = originalRef.current ?? {};
    const updates = {};
    if (name     !== orig.name)     updates.name     = name.trim();
    if (username !== orig.username) updates.username = username.trim();
    if (email    !== orig.email)    updates.email    = email.trim();
    if (roleId   !== orig.roleId)   updates.roleId   = Number(roleId);
    if (userType !== orig.userType) updates.userType = userType || undefined;
    if (mobile   !== orig.mobile)   updates.mobile   = mobile.trim() || undefined;
    if (status   !== orig.status)   updates.status   = status;

    const hasProfileChanges = Object.keys(updates).length > 0;

    if (!hasProfileChanges && !wantsPasswordChange) {
      setGeneralError('No changes to save.');
      return;
    }

    setSubmitting(true);
    try {
      // Update profile fields first (sequential, not parallel — so a profile
      // failure stops us before touching the password endpoint).
      if (hasProfileChanges) {
        await api.patch(`/admin/v1/users/${userId}`, updates);
      }

      // Update password via its dedicated endpoint.
      // See the comment at the top of this file explaining why passwords have
      // their own endpoint separate from the general PATCH.
      if (wantsPasswordChange) {
        await api.post(`/admin/v1/users/${userId}/set-password`, { newPassword });
      }

      setSuccessMessage('User updated successfully!');
      setTimeout(() => navigate('/user-management/users'), 1500);
    } catch (error) {
      const code    = error.response?.data?.error?.code;
      const message = error.response?.data?.error?.message
        ?? 'Something went wrong. Please try again.';

      if (code === 'VAL_WEAK_PASSWORD') {
        // Inject the backend's password error directly below the password field.
        setFieldErrors(prev => ({ ...prev, newPassword: message }));
        setTouched(prev => new Set(prev).add('newPassword'));
      } else {
        setGeneralError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = loadingUser || loadingRoles;

  return (
    <div className="isin-master">
      <h1 className="page-heading">Edit User</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>User Details</span>
        </div>

        {isLoading ? (
          <p style={{ padding: '24px', color: '#777', fontFamily: 'Arial, sans-serif' }}>
            Loading…
          </p>
        ) : (
          /*
           * noValidate disables browser constraint validation so our custom
           * inline messages (field-error spans) are the only validation shown.
           */
          <form className="adduser-form" onSubmit={handleSubmit} noValidate>

            {successMessage && (
              <div className="adduser-success-banner">{successMessage}</div>
            )}
            {generalError && (
              <div className="adduser-error-banner">{generalError}</div>
            )}

            {/*
             * Single 3-column grid for the entire form.
             * The section divider and button row each use grid-column: 1 / -1
             * to span all three columns without breaking the grid flow.
             *
             *   Row 1: [Name]          [User Name]            [Email]
             *   Row 2: [Roles (span 2).....................]  [Mobile]
             *   Row 3: [User Type]     [Status]               [empty]
             *   Row 4: [──── Change Password (optional) ────] (span 3)
             *   Row 5: [New Password]  [Confirm New Password] [empty]
             *   Row 6: [UPDATE USER]   [CANCEL]   [SEND RESET LINK] (span 3)
             */}
            <div className="adduser-grid">

              {/* ── Row 1 ─────────────────────────────────────────────── */}

              <div className="filter-group">
                <label htmlFor="eu-name">Name</label>
                <input
                  id="eu-name"
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
                <label htmlFor="eu-username">User Name</label>
                <input
                  id="eu-username"
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
                <label htmlFor="eu-email">Email</label>
                <input
                  id="eu-email"
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

              <div className="filter-group" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="eu-roleId">Roles</label>
                <select
                  id="eu-roleId"
                  className="filter-input adduser-input adduser-select"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  onBlur={(e) => handleBlur('roleId', e.target.value)}
                >
                  <option value="">Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                {touched.has('roleId') && fieldErrors.roleId && (
                  <span className="field-error">{fieldErrors.roleId}</span>
                )}
              </div>

              <div className="filter-group">
                <label htmlFor="eu-mobile">Mobile</label>
                <input
                  id="eu-mobile"
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

              {/* ── Row 3 ─────────────────────────────────────────────── */}

              <div className="filter-group">
                <label htmlFor="eu-userType">User Type</label>
                <select
                  id="eu-userType"
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
                <label htmlFor="eu-status">Status</label>
                <select
                  id="eu-status"
                  className="filter-input adduser-input adduser-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              {/* ── Row 4: section divider (span 3) ───────────────────── */}

              <div className="edit-section-divider">Change Password (optional)</div>

              {/* ── Row 5: password fields ────────────────────────────── */}

              <div className="filter-group">
                <label htmlFor="eu-newPassword">New Password</label>
                <input
                  id="eu-newPassword"
                  type="password"
                  className="filter-input adduser-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onBlur={(e) => handleBlur('newPassword', e.target.value)}
                />
                {touched.has('newPassword') && fieldErrors.newPassword && (
                  <span className="field-error">{fieldErrors.newPassword}</span>
                )}
              </div>

              <div className="filter-group">
                <label htmlFor="eu-confirmPassword">Confirm New Password</label>
                <input
                  id="eu-confirmPassword"
                  type="password"
                  className="filter-input adduser-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={(e) => handleBlur('confirmPassword', e.target.value)}
                />
                {touched.has('confirmPassword') && fieldErrors.confirmPassword && (
                  <span className="field-error">{fieldErrors.confirmPassword}</span>
                )}
              </div>

              {/* ── Row 6: action buttons (span 3) ────────────────────── */}

              <div className="edit-btn-row">

                <button
                  type="submit"
                  className="btn-adduser"
                  disabled={submitting || !!successMessage}
                >
                  {submitting ? 'UPDATING…' : 'UPDATE USER'}
                </button>

                <button
                  type="button"
                  className="btn-reset-link"
                  onClick={() => console.log('Reset password link - API not connected yet')}
                >
                  SEND RESET PASSWORD LINK
                </button>

                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => navigate('/user-management/users')}
                  disabled={submitting}
                >
                  CANCEL
                </button>

              </div>

            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EditUser;
