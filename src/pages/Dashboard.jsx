import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../IsinMaster.css';
import './Dashboard.css';
import { hasPermission } from '../auth';
import { get } from '../services/companyProfileService';

const PROFILE_FIELDS = [
  ['Company Name',       'companyName'],
  ['SEBI Reg No',        'sebiRegistrationNo'],
  ['Address',            'regdOfficeAddress'],
  ['Phone',              'phone'],
  ['Email',              'email'],
  ['Website',            'website'],
  ['CIN',                'cin'],
  ['NSDL BP ID',         'nsdlBpId'],
  ['CDSL RTA ID',        'cdslRtaId'],
];

function displayVal(v) {
  return v && String(v).trim() ? v : '—';
}

function Dashboard() {
  const canViewProfile = hasPermission('company_profile:view');
  const canEditProfile = hasPermission('company_profile:update');

  const [profile,      setProfile]      = useState(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!canViewProfile) return;
    get()
      .then(setProfile)
      .catch(() => setProfileError('Could not load company details.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="isin-master">
      <h1 className="page-heading">Dashboard</h1>

      {canViewProfile && (
        <div className="im-card">
          <div className="im-card-header">
            <span>Company Details</span>
            {canEditProfile && (
              <Link to="/company-profile" className="dash-edit-link">Edit</Link>
            )}
          </div>

          {profileError ? (
            <div className="im-banner im-banner--error" style={{ margin: 12 }}>{profileError}</div>
          ) : !profile ? (
            <div className="im-empty-state">Loading…</div>
          ) : (
            <div className="dash-detail-grid">
              {PROFILE_FIELDS.map(([label, field]) => (
                <div key={field} className="dash-detail-item">
                  <span className="dash-detail-label">{label}</span>
                  <span className="dash-detail-value">{displayVal(profile[field])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
