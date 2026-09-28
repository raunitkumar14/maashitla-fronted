import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from './api/axios';
import EditCompanyModal from './EditCompanyModal';
import './IsinMaster.css';
import './Company.css';
import './CompanyDetails.css';

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

const TOTAL_COLS = COLUMNS.length + 1; // +1 for View ISIN

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

function CompanyDetails() {
  const { issuerCode } = useParams();
  const navigate       = useNavigate();

  const [issuer,     setIssuer]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [fetchKey,   setFetchKey]   = useState(0);
  const [editOpen,   setEditOpen]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await api.get(`/admin/v1/issuers/${issuerCode}`);
        if (cancelled) return;
        const raw = res.data?.data;
        // Mirror EditRoleModal pattern: single-entity endpoints often nest under
        // a named key (e.g. { data: { issuer: {...} } }). Fall back through
        // common shapes to handle flat and list-wrapped responses too.
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

  function handleEditSuccess() {
    setEditOpen(false);
    setFetchKey(k => k + 1);
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
          <button
            className="btn-upload"
            onClick={() => setEditOpen(true)}
            disabled={loading || !issuer}
          >
            ✏ Edit Company
          </button>
        </div>

        {fetchError && (
          <div className="im-banner im-banner--error" style={{ margin: '8px 14px 0' }}>
            {fetchError}
          </div>
        )}

        <div className="im-table-wrapper">
          <table className="im-table">
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key}>{col.header}</th>
                ))}
                <th>View ISIN</th>
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
                  <td>
                    <button
                      className="company-icon-btn"
                      title="View ISINs for this company"
                      onClick={() => navigate(`/company/${issuerCode}/isins`)}
                    >
                      →
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && issuer && (
        <EditCompanyModal
          key={issuerCode}
          issuerCode={issuerCode}
          issuer={issuer}
          onClose={() => setEditOpen(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}

export default CompanyDetails;
