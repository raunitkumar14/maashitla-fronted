import { useState } from 'react';
import api from './api/axios';
import './Users.css';
import './AddUser.css';
import './EditUser.css';
import './EditCompanyModal.css';

// All fields the user may edit (issuerId, issuerCode, totalIsin excluded).
const FORM_LAYOUT = [
  { section: 'Issuer Information' },
  { key: 'issuerName',                 label: 'Issuer Name',                   cols: 3 },
  { key: 'issuerAddress1',             label: 'Issuer Address (1)' },
  { key: 'issuerAddress2',             label: 'Issuer Address (2)' },
  { key: 'issuerAddress3',             label: 'Issuer Address (3)' },
  { key: 'issuerCity',                 label: 'Issuer City' },
  { key: 'issuerState',                label: 'Issuer State' },
  { key: 'issuerCountry',              label: 'Issuer Country' },
  { key: 'issuerZipCode',              label: 'Issuer Zip Code' },
  { key: 'issuerPhone1',               label: 'Issuer Phone (1)' },
  { key: 'issuerPhone2',               label: 'Issuer Phone (2)' },
  { key: 'issuerEmail',                label: 'Issuer Email 1' },
  { key: 'issuerEmail2',               label: 'Issuer Email 2' },
  { key: 'issuerEmail3',               label: 'Issuer Email 3' },
  { key: 'authorisedSignatory',        label: 'Authorised Signatory' },
  { key: 'designationOfAuthSignatory', label: 'Designation of Auth Signatory', cols: 2 },

  { section: 'GST Details' },
  { key: 'gstAddress1',                label: 'GST Address 1' },
  { key: 'gstAddress2',                label: 'GST Address 2' },
  { key: 'gstAddress3',                label: 'GST Address 3' },
  { key: 'gstCity',                    label: 'GST City' },
  { key: 'gstState',                   label: 'GST State' },
  { key: 'gstPin',                     label: 'GST PIN' },
  { key: 'gstCountry',                 label: 'GST Country' },
  { key: 'gstin',                      label: 'GSTIN' },
  { key: 'pan',                        label: 'PAN' },
  { key: 'tan',                        label: 'TAN' },

  { section: 'Registration & Listing' },
  { key: 'cin',                        label: 'Corporate Identity Number (CIN)' },
  { key: 'oldName',                    label: 'Old Name (If Any)' },
  { key: 'dateOfIncorporation',        label: 'Date of Incorporation',          type: 'date' },
  { key: 'rtaCodeNsdl',                label: 'RTA Code NSDL' },
  { key: 'rtaCodeCdsl',                label: 'RTA Code CDSL' },
  { key: 'listingStatus',              label: 'Listing Status' },
  { key: 'listingAt',                  label: 'Listing at' },
  { key: 'symbol',                     label: 'Symbol' },
  { key: 'scripCode',                  label: 'Scrip Code' },

  { section: 'Professional Contact' },
  { key: 'professionalOrAnyOther',     label: 'Professional / Any other' },
  { key: 'professionalName',           label: 'Professional Name' },
  { key: 'professionalPhone1',         label: 'Phone 1' },
  { key: 'professionalPhone2',         label: 'Phone 2' },
  { key: 'professionalEmail',          label: 'Email ID' },

  { section: 'Other' },
  { key: 'source',                     label: 'Source' },
  { key: 'remarks',                    label: 'Remarks',                        cols: 2 },
];

function initForm(issuer) {
  const form = {};
  FORM_LAYOUT.forEach(item => {
    if (item.section) return;
    let val = issuer?.[item.key] ?? '';
    if (item.key === 'dateOfIncorporation' && val) {
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
    if (item.section) return;
    const val = form[item.key];
    body[item.key] = val === '' ? null : val;
  });
  return body;
}

function EditCompanyModal({ issuerCode, issuer, onClose, onSuccess }) {
  const [form,       setFormState] = useState(() => initForm(issuer));
  const [submitting, setSubmitting] = useState(false);
  const [apiError,   setApiError]  = useState('');

  function setField(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');
    setSubmitting(true);
    try {
      await api.patch(`/admin/v1/issuers/${issuerCode}`, buildBody(form));
      onSuccess();
    } catch (err) {
      const message =
        err.response?.data?.error?.message ?? 'Something went wrong. Please try again.';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="ecm-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecm-dialog">

        <div className="ecm-header">
          <span className="ecm-title">Edit Company — {issuerCode}</span>
          <button className="ecm-close-btn" type="button" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="ecm-form-root">

          <div className="ecm-body">
            {apiError && (
              <div className="adduser-error-banner ecm-banner">{apiError}</div>
            )}

            <div className="adduser-grid">
              {FORM_LAYOUT.map((item, i) => {
                if (item.section) {
                  return (
                    <div key={`s-${i}`} className="edit-section-divider">
                      {item.section}
                    </div>
                  );
                }
                return (
                  <div
                    key={item.key}
                    className="filter-group"
                    style={item.cols ? { gridColumn: `span ${item.cols}` } : undefined}
                  >
                    <label htmlFor={`ecm-${item.key}`}>{item.label}</label>
                    <input
                      id={`ecm-${item.key}`}
                      type={item.type ?? 'text'}
                      className="filter-input adduser-input"
                      value={form[item.key]}
                      onChange={e => setField(item.key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ecm-footer">
            <div className="edit-btn-row">
              <button
                type="submit"
                className="btn-adduser"
                disabled={submitting}
              >
                {submitting ? 'SAVING…' : 'SAVE CHANGES'}
              </button>
              <button
                type="button"
                className="btn-cancel"
                onClick={onClose}
                disabled={submitting}
              >
                CANCEL
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default EditCompanyModal;
