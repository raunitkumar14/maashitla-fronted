import { useState, useEffect } from 'react';
import api from './api/axios';
import './IsinMaster.css';
import './Users.css';
import './Profile.css';

function formatDate(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [apiError,        setApiError]        = useState('');
  const [success,         setSuccess]         = useState(false);
  const [submitting,      setSubmitting]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setValidationError('');
    setApiError('');

    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setValidationError('New password must contain at least one uppercase letter.');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setValidationError('New password must contain at least one lowercase letter.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setValidationError('New password must contain at least one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Confirm password does not match new password.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/v1/profile/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setApiError(err.response?.data?.error?.message ?? 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="profile-modal-overlay">
      <div className="profile-modal">
        <div className="profile-modal-header">
          <span>Change Password</span>
          <button type="button" className="profile-modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="profile-modal-body" onSubmit={handleSubmit}>
          {success && (
            <div className="profile-alert profile-alert--success">
              Password changed successfully!
            </div>
          )}
          {(validationError || apiError) && (
            <div className="profile-alert profile-alert--error">
              {validationError || apiError}
            </div>
          )}

          <div className="filter-group" style={{ marginTop: 12 }}>
            <label htmlFor="cpCurrentPass">Current Password</label>
            <input
              id="cpCurrentPass"
              type="password"
              className="filter-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="filter-group" style={{ marginTop: 24 }}>
            <label htmlFor="cpNewPass">New Password</label>
            <input
              id="cpNewPass"
              type="password"
              className="filter-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="filter-group" style={{ marginTop: 24 }}>
            <label htmlFor="cpConfirmPass">Confirm New Password</label>
            <input
              id="cpConfirmPass"
              type="password"
              className="filter-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn-action btn-action--white" onClick={onClose}>
              CANCEL
            </button>
            <button type="submit" className="btn-action btn-action--pink" disabled={submitting}>
              {submitting ? 'SAVING…' : 'SAVE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Profile() {
  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [showModal,  setShowModal]  = useState(false);
  const [twoFaMsg,   setTwoFaMsg]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/admin/v1/profile');
        setProfile(res.data.data);
      } catch {
        setFetchError('Failed to load profile. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="isin-master">
        <p style={{ padding: 20, fontFamily: 'Arial, sans-serif', color: '#666' }}>Loading…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="isin-master">
        <p style={{ padding: 20, fontFamily: 'Arial, sans-serif', color: '#c0392b' }}>{fetchError}</p>
      </div>
    );
  }

  const initial = profile?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="isin-master">
      <h1 className="page-heading">Profile</h1>

      {/* ── Hero card ── */}
      <div className="im-card profile-hero-card">
        <div className="profile-avatar">{initial}</div>
        <div className="profile-hero-info">
          <div className="profile-hero-name">{profile.name}</div>
          <div className="profile-hero-email">{profile.email}</div>
          <div className="profile-hero-badges">
            <span className="profile-badge profile-badge--type">{profile.userType}</span>
            {profile.status === 'ACTIVE' && (
              <span className="profile-badge profile-badge--active">ACTIVE</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Account Information ── */}
      <div className="im-card">
        <div className="im-card-header"><span>Account Information</span></div>
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Username</span>
            <span className="profile-info-value">{profile.username}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">User ID</span>
            <span className="profile-info-value">{profile.id}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Status</span>
            <span className="profile-info-value">{profile.status}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Created On</span>
            <span className="profile-info-value">{formatDate(profile.createdAt)}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Updated On</span>
            <span className="profile-info-value">{formatDate(profile.updatedAt)}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Created By</span>
            <span className="profile-info-value">{profile.createdBy ?? '—'}</span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Roles</span>
            <span className="profile-info-value">
              {profile.role?.name
                ? <span className="profile-role-badge">{profile.role.name}</span>
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Security Settings ── */}
      <div className="im-card">
        <div className="im-card-header"><span>Security Settings</span></div>
        <div className="profile-security">
          <button
            className="btn-action btn-action--pink"
            onClick={() => { setShowModal(true); setTwoFaMsg(''); }}
          >
            CHANGE PASSWORD
          </button>
          <button
            className="btn-action btn-action--white"
            onClick={() => setTwoFaMsg('Two-factor authentication is coming soon.')}
          >
            ENABLE 2FA
          </button>
          {twoFaMsg && <span className="profile-toast">{twoFaMsg}</span>}
        </div>
      </div>

      {showModal && <ChangePasswordModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

export default Profile;
