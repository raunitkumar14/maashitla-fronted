import { useState, useEffect, useRef } from 'react';
import '../IsinMaster.css';
import './CompanyProfile.css';
import { hasPermission } from '../auth';
import { get, update, clear } from '../services/companyProfileService';

const FIELDS = [
  'companyName', 'sebiRegistrationNo', 'regdOfficeAddress',
  'phone', 'email', 'website', 'cin', 'nsdlBpId', 'cdslRtaId',
];

const EMPTY_FORM = Object.fromEntries(FIELDS.map(f => [f, '']));

function profileToForm(p) {
  return Object.fromEntries(FIELDS.map(f => [f, p[f] ?? '']));
}

function fmtDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateEmail(v) {
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter a valid email address.';
}

function validatePhone(v) {
  if (!v) return null;
  return /^[0-9+\-()\s]+$/.test(v) ? null : 'Phone may only contain digits, +, -, spaces and parentheses.';
}

function validateWebsite(v) {
  if (!v) return null;
  const url = v.startsWith('http://') || v.startsWith('https://') ? v : `https://${v}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error();
    return null;
  } catch {
    return 'Enter a valid URL or domain (e.g. example.com or https://example.com).';
  }
}

function validateForm(form) {
  return {
    email:   validateEmail(form.email),
    phone:   validatePhone(form.phone),
    website: validateWebsite(form.website),
  };
}

function CompanyProfile() {
  const canUpdate = hasPermission('company_profile:update');
  const canDelete = hasPermission('company_profile:delete');
  const readOnly  = !canUpdate;

  const [loaded,      setLoaded]      = useState(null);
  const [loadError,   setLoadError]   = useState('');
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');
  const [toast,       setToast]       = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [clearing,    setClearing]    = useState(false);
  const [clearError,  setClearError]  = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    get()
      .then(p => { setLoaded(p); setForm(profileToForm(p)); })
      .catch(() => setLoadError('Failed to load company profile.'));
    return () => clearTimeout(toastTimer.current);
  }, []);

  function showSuccessToast(msg) {
    setSaveError('');
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  }

  async function handleSave() {
    const errs = validateForm(form);
    if (Object.values(errs).some(Boolean)) { setErrors(errs); return; }
    setErrors({});

    const payload = {};
    for (const field of FIELDS) {
      const curr = form[field].trim();
      const orig = (loaded?.[field] ?? '').trim();
      if (curr !== orig) payload[field] = curr || null;
    }
    if (Object.keys(payload).length === 0) {
      showSuccessToast('No changes to save.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const updated = await update(payload);
      setLoaded(updated);
      setForm(profileToForm(updated));
      showSuccessToast('Company profile saved.');
    } catch (err) {
      setSaveError(err.response?.data?.error?.message ?? err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setClearError('');
    try {
      const cleared = await clear();
      setLoaded(cleared);
      setForm(profileToForm(cleared));
      setShowConfirm(false);
      showSuccessToast('Company details cleared.');
    } catch (err) {
      setClearError(err.response?.data?.error?.message ?? err.message ?? 'Clear failed.');
    } finally {
      setClearing(false);
    }
  }

  if (loadError) {
    return (
      <div className="isin-master">
        <h1 className="page-heading">Company Profile</h1>
        <div className="im-banner im-banner--error">{loadError}</div>
      </div>
    );
  }

  if (loaded === null) {
    return (
      <div className="isin-master">
        <h1 className="page-heading">Company Profile</h1>
        <div className="im-empty-state">Loading…</div>
      </div>
    );
  }

  function Field({ id, label, field, type = 'text' }) {
    return (
      <div className="cp-field">
        <label className="cp-label" htmlFor={id}>{label}</label>
        <input
          id={id}
          type={type}
          className={`cp-input${readOnly ? ' cp-input--readonly' : ''}${errors[field] ? ' cp-input--error' : ''}`}
          value={form[field]}
          onChange={e => handleChange(field, e.target.value)}
          readOnly={readOnly}
        />
        {errors[field] && <span className="cp-err">{errors[field]}</span>}
      </div>
    );
  }

  return (
    <div className="isin-master">
      <h1 className="page-heading">Company Profile</h1>

      <div className="im-card">
        <div className="im-card-header">RTA Details</div>

        <div className="cp-form">
          {toast    && <div className="im-banner im-banner--success cp-toast">{toast}</div>}
          {saveError && <div className="im-banner im-banner--error   cp-toast">{saveError}</div>}

          <div className="cp-grid">
            <Field id="cp-name"    label="Company Name"         field="companyName" />
            <Field id="cp-sebi"    label="SEBI Registration No" field="sebiRegistrationNo" />

            <div className="cp-field cp-field-full">
              <label className="cp-label" htmlFor="cp-addr">Regd. Office Address</label>
              <textarea
                id="cp-addr"
                className={`cp-input cp-textarea${readOnly ? ' cp-input--readonly' : ''}`}
                value={form.regdOfficeAddress}
                onChange={e => handleChange('regdOfficeAddress', e.target.value)}
                readOnly={readOnly}
              />
            </div>

            <Field id="cp-phone"   label="Phone"       field="phone" />
            <Field id="cp-email"   label="Email"       field="email" type="email" />
            <Field id="cp-website" label="Website"     field="website" />
            <Field id="cp-cin"     label="CIN"         field="cin" />
            <Field id="cp-nsdl"    label="NSDL BP ID"  field="nsdlBpId" />
            <Field id="cp-cdsl"    label="CDSL RTA ID" field="cdslRtaId" />
          </div>

          {!readOnly && (
            <div className="cp-actions">
              <button
                className="btn-action btn-action--pink"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'SAVE'}
              </button>
              {canDelete && (
                <button
                  className="btn-action btn-action--white"
                  onClick={() => { setClearError(''); setShowConfirm(true); }}
                  disabled={saving}
                >
                  CLEAR DETAILS
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {loaded?.updatedAt && (
        <div className="cp-updated-line">
          Last updated {fmtDateTime(loaded.updatedAt)}
          {loaded.updatedByName ? ` by ${loaded.updatedByName}` : ''}
        </div>
      )}

      {showConfirm && (
        <div className="cp-backdrop" onClick={() => !clearing && setShowConfirm(false)}>
          <div className="cp-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="cp-dialog-title">Clear Company Details?</h3>
            <p className="cp-dialog-body">
              This will remove all company details from the PDFs. Continue?
            </p>
            {clearError && (
              <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>
                {clearError}
              </div>
            )}
            <div className="cp-dialog-actions">
              <button
                className="btn-action btn-action--white"
                onClick={() => setShowConfirm(false)}
                disabled={clearing}
              >
                CANCEL
              </button>
              <button
                className="btn-action btn-action--pink"
                onClick={handleClear}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompanyProfile;
