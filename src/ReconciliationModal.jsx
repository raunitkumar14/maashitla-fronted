import { useEffect } from 'react';
import './UploadModal.css';
import './RecoUpload.css';

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export default function ReconciliationModal({ dates, loadingDates, datesError, onSelect, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="upload-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="reco-modal reco-datepicker-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select a Recon Date"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="um-header">
          <span className="um-header-badge">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none"
              stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="2" width="14" height="13" rx="1"/>
              <line x1="1" y1="6" x2="15" y2="6"/>
              <line x1="5" y1="1" x2="5" y2="4"/>
              <line x1="11" y1="1" x2="11" y2="4"/>
            </svg>
          </span>
          <span className="um-header-title">Select a Recon Date</span>
          <button className="um-close-btn" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 20px 4px' }}>
          {loadingDates ? (
            <div className="reco-uploading-msg"
              style={{ borderBottom: 'none', background: 'none', padding: '8px 0' }}>
              <span className="reco-spinner" /> Loading dates…
            </div>
          ) : datesError ? (
            <div className="reco-upload-error">{datesError}</div>
          ) : !dates || dates.length === 0 ? (
            <p className="reco-empty-text">No reconciliation dates found.</p>
          ) : (
            <div className="im-table-wrapper" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="im-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Date</th>
                    <th>Total ISINs</th>
                    <th>Reconciled</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map(row => (
                    <tr
                      key={row.reconDate}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelect(row.reconDate, row)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="radio"
                          name="reconDate"
                          style={{ cursor: 'pointer', pointerEvents: 'none' }}
                        />
                      </td>
                      <td>{fmtDate(row.reconDate)}</td>
                      <td>{row.total}</td>
                      <td style={{ color: row.reconciled > 0 ? '#2e7d32' : undefined }}>
                        {row.reconciled}
                      </td>
                      <td style={{ color: row.pending > 0 ? '#c62828' : undefined }}>
                        {row.pending}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="reco-modal-footer">
          <button className="btn-action btn-action--white" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}
