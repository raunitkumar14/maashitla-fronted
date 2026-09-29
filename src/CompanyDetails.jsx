import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from './api/axios';
import './IsinMaster.css';
import './Company.css';
import './CompanyDetails.css';
import './Users.css';
import './AddUser.css';
import './EditUser.css';

const COLUMNS = [
  { header: 'Issuer ID',                       key: 'issuerId' },
  { header: 'Issuer Code',                     key: 'issuerCode' },
  { header: 'Issuer Name',                     key: 'issuerName' },
  { header: 'Issuer Address(1)',               key: 'issuerAddress1' },
  { header: 'Issuer Address(2)',               key: 'issuerAddress2' },
  { header: 'Issuer Address(3)',               key: 'issuerAddress3' },
  { header: 'Issuer City',                     key: 'issuerCity' },
  { header: 'Issuer State',                    key: 'issuerState' },
  { header: 'Issuer Country',                  key: 'issuerCountry' },
  { header: 'Issuer Zip Code',                 key: 'issuerZipCode' },
  { header: 'Issuer Phone(1)',                 key: 'issuerPhone1' },
  { header: 'Issuer Phone(2)',                 key: 'issuerPhone2' },
  { header: 'Issuer Email 1',                  key: 'issuerEmail' },
  { header: 'Issuer Email 2',                  key: 'issuerEmail2' },
  { header: 'Issuer Email 3',                  key: 'issuerEmail3' },
  { header: 'GST Address 1',                   key: 'gstAddress1' },
  { header: 'GST Address 2',                   key: 'gstAddress2' },
  { header: 'GST Address 3',                   key: 'gstAddress3' },
  { header: 'GST City',                        key: 'gstCity' },
  { header: 'GST State',                       key: 'gstState' },
  { header: 'GST PIN',                         key: 'gstPin' },
  { header: 'GST COUNTRY',                     key: 'gstCountry' },
  { header: 'GSTIN',                           key: 'gstin' },
  { header: 'PAN',                             key: 'pan' },
  { header: 'TAN',                             key: 'tan' },
  { header: 'Authorised Signatory',            key: 'authorisedSignatory' },
  { header: 'Designation of Auth Signatory',   key: 'designationOfAuthSignatory' },
  { header: 'Total ISIN',                      key: 'totalIsin' },
  { header: 'Corporate Identity Number (CIN)', key: 'cin' },
  { header: 'Old Name (If Any)',               key: 'oldName' },
  { header: 'Date of Incorporation',           key: 'dateOfIncorporation' },
  { header: 'RTA Code NSDL',                   key: 'rtaCodeNsdl' },
  { header: 'RTA Code CDSL',                   key: 'rtaCodeCdsl' },
  { header: 'Listing Status',                  key: 'listingStatus' },
  { header: 'Listing at',                      key: 'listingAt' },
  { header: 'Symbol',                          key: 'symbol' },
  { header: 'Scrip Code',                      key: 'scripCode' },
  { header: 'Professional/Any other',          key: 'professionalOrAnyOther' },
  { header: 'Professional Name',               key: 'professionalName' },
  { header: 'Phone 1',                         key: 'professionalPhone1' },
  { header: 'Phone 2',                         key: 'professionalPhone2' },
  { header: 'Email ID',                        key: 'professionalEmail' },
  { header: 'Remarks',                         key: 'remarks' },
];

const TOTAL_COLS = COLUMNS.length;

// Mirrors the old EditCompanyModal layout exactly; read-only markers added for
// issuerId / issuerCode so they appear in the grid but stay non-editable.
const FORM_LAYOUT = [
  { section: 'Issuer Information' },
  { key: 'issuerId',                label: 'Issuer ID',                          readOnly: true },
  { key: 'issuerCode',              label: 'Issuer Code',                        readOnly: true },
  { key: 'issuerName',              label: 'Issuer Name',                        cols: 3 },
  { key: 'issuerAddress1',          label: 'Issuer Address (1)' },
  { key: 'issuerAddress2',          label: 'Issuer Address (2)' },
  { key: 'issuerAddress3',          label: 'Issuer Address (3)' },
  { key: 'issuerCity',              label: 'Issuer City' },
  { key: 'issuerState',             label: 'Issuer State' },
  { key: 'issuerCountry',           label: 'Issuer Country' },
  { key: 'issuerZipCode',           label: 'Issuer Zip Code' },
  { key: 'issuerPhone1',            label: 'Issuer Phone (1)' },
  { key: 'issuerPhone2',            label: 'Issuer Phone (2)' },
  { key: 'issuerEmail',             label: 'Issuer Email 1' },
  { key: 'issuerEmail2',            label: 'Issuer Email 2' },
  { key: 'issuerEmail3',            label: 'Issuer Email 3' },
  { key: 'authorisedSignatory',     label: 'Authorised Signatory' },
  { key: 'designationOfAuthSignatory', label: 'Designation of Auth Signatory',  cols: 2 },

  { section: 'GST Details' },
  { key: 'gstAddress1',             label: 'GST Address 1' },
  { key: 'gstAddress2',             label: 'GST Address 2' },
  { key: 'gstAddress3',             label: 'GST Address 3' },
  { key: 'gstCity',                 label: 'GST City' },
  { key: 'gstState',                label: 'GST State' },
  { key: 'gstPin',                  label: 'GST PIN' },
  { key: 'gstCountry',              label: 'GST Country' },
  { key: 'gstin',                   label: 'GSTIN' },
  { key: 'pan',                     label: 'PAN' },
  { key: 'tan',                     label: 'TAN' },

  { section: 'Registration & Listing' },
  { key: 'cin',                     label: 'Corporate Identity Number (CIN)' },
  { key: 'oldName',                 label: 'Old Name (If Any)' },
  { key: 'dateOfIncorporation',     label: 'Date of Incorporation',              type: 'date' },
  { key: 'rtaCodeNsdl',             label: 'RTA Code NSDL' },
  { key: 'rtaCodeCdsl',             label: 'RTA Code CDSL' },
  { key: 'listingStatus',           label: 'Listing Status' },
  { key: 'listingAt',               label: 'Listing at' },
  { key: 'symbol',                  label: 'Symbol' },
  { key: 'scripCode',               label: 'Scrip Code' },

  { section: 'Professional Contact' },
  { key: 'professionalOrAnyOther',  label: 'Professional / Any other' },
  { key: 'professionalName',        label: 'Professional Name' },
  { key: 'professionalPhone1',      label: 'Phone 1' },
  { key: 'professionalPhone2',      label: 'Phone 2' },
  { key: 'professionalEmail',       label: 'Email ID' },

  { section: 'Other' },
  { key: 'source',                  label: 'Source' },
  { key: 'remarks',                 label: 'Remarks',                            cols: 2 },
];

function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().slice(0, 10);
}

function fmtCell(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (key === 'dateOfIncorporation') return fmtDate(val);
  return String(val);
}

function initForm(issuer) {
  const form = {};
  FORM_LAYOUT.forEach(item => {
    if (item.section) return;
    let val = issuer?.[item.key] ?? '';
    if (item.type === 'date' && val) {
      const d = new Date(val);
      val = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    form[item.key] = val == null ? '' : String(val);
  });
  return form;
}

function buildBody(form) {
  const body = {};
  FORM_LAYOUT.forEach(item => {
    if (item.section || item.readOnly) return;
    const val = form[item.key];
    body[item.key] = val === '' ? null : val;
  });
  return body;
}

function CompanyDetails() {
  const { issuerCode } = useParams();
  const navigate       = useNavigate();

  const [issuer,     setIssuer]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [fetchKey,   setFetchKey]   = useState(0);

  const [editMode,   setEditMode]   = useState(false);
  const [form,       setFormState]  = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError,   setApiError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get(`/admin/v1/issuers/${issuerCode}`);
        if (cancelled) return;
        const raw = res.data?.data;
        const issuerData =
          raw?.issuer ??
          (Array.isArray(raw?.items) ? raw.items[0] : null) ??
          (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null) ??
          res.data;
        setIssuer(issuerData);
      } catch {
        if (!cancelled) setFetchError('Failed to load company details. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [issuerCode, fetchKey]);

  function handleEdit() {
    setFormState(initForm(issuer));
    setApiError('');
    setEditMode(true);
  }

  function handleCancel() {
    setEditMode(false);
    setApiError('');
  }

  async function handleSave() {
    setApiError('');
    setSubmitting(true);
    try {
      await api.patch(`/admin/v1/issuers/${issuerCode}`, buildBody(form));
      setEditMode(false);
      setFetchKey(k => k + 1);
    } catch (err) {
      const message =
        err.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function setField(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }));
  }

  const companyLabel = issuer?.issuerName
    ? `${issuer.issuerName} (${issuerCode})`
    : issuerCode;

  return (
    <div className="isin-master">

      <div className="ci-breadcrumb">
        <button className="ci-back-btn" onClick={() => navigate('/company')}>
          ← Company List
        </button>
        <span className="ci-breadcrumb-sep">/</span>
        <span className="ci-breadcrumb-current">{companyLabel}</span>
      </div>

      <h1 className="page-heading">Company Details</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>Issuer Information</span>
          {!editMode ? (
            <div className="cd-edit-actions">
              <button
                className="btn-upload"
                onClick={() => navigate(`/company/${issuerCode}/isins`)}
                disabled={loading || !issuer}
              >
                View ISIN
              </button>
              <button
                className="btn-upload"
                onClick={handleEdit}
                disabled={loading || !issuer}
              >
                ✏ Edit Company
              </button>
            </div>
          ) : (
            <div className="cd-edit-actions">
              <button
                className="btn-upload"
                onClick={handleSave}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                className="btn-action--white"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {fetchError && !editMode && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {fetchError}
          </div>
        )}

        {/* ── Read-only view ── */}
        {!editMode && (
          <div className="im-table-wrapper">
            <table className="im-table">
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th key={col.key}>{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="im-empty-state" colSpan={TOTAL_COLS}>Loading…</td>
                  </tr>
                ) : !issuer ? (
                  <tr>
                    <td className="im-empty-state" colSpan={TOTAL_COLS}>No data available.</td>
                  </tr>
                ) : (
                  <tr>
                    {COLUMNS.map(col => (
                      <td key={col.key}>{fmtCell(col.key, issuer[col.key])}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Edit view: labeled-grid form matching the old popup layout ── */}
        {editMode && (
          <div className="cd-edit-form">
            {apiError && (
              <div className="adduser-error-banner">{apiError}</div>
            )}

            <div className="adduser-grid">
              {FORM_LAYOUT.map((item, i) => {
                if (item.section) {
                  return (
                    <div key={`sec-${i}`} className="edit-section-divider">
                      {item.section}
                    </div>
                  );
                }
                return (
                  <div
                    key={item.key}
                    className={`filter-group${item.readOnly ? ' filter-group--disabled' : ''}`}
                    style={item.cols ? { gridColumn: `span ${item.cols}` } : undefined}
                  >
                    <label htmlFor={`cdf-${item.key}`}>{item.label}</label>
                    <input
                      id={`cdf-${item.key}`}
                      type={item.type ?? 'text'}
                      className="filter-input adduser-input"
                      value={form[item.key] ?? ''}
                      readOnly={item.readOnly}
                      onChange={item.readOnly ? undefined : e => setField(item.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

export default CompanyDetails;
