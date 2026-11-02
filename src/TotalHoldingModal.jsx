import { useState } from 'react';
import api from './api/axios';

function TotalHoldingModal({ row, onClose, onSaved }) {
  const current = row.totalHoldings != null ? String(row.totalHoldings) : '';
  const [value,  setValue]  = useState(current);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  async function handleSave() {
    const trimmed = value.trim();
    const totalHoldings = trimmed === '' ? null : Number(trimmed);
    if (totalHoldings !== null && (!Number.isInteger(totalHoldings) || totalHoldings < 0)) {
      setErrMsg('Total Holding must be a non-negative whole number.');
      return;
    }
    setSaving(true);
    setErrMsg('');
    try {
      await api.patch(`/admin/v1/isins/${row.isin}/total-holdings`, { totalHoldings });
      onSaved(row.isin, { totalHoldings });
    } catch (err) {
      setErrMsg(err.response?.data?.error?.message ?? err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="upload-overlay" onClick={!saving ? onClose : undefined}>
      <div className="im-edit-listing-modal" onClick={e => e.stopPropagation()}>
        <div className="um-header">
          <span className="um-header-badge" style={{ fontSize: 14 }}>&#9998;</span>
          <span className="um-header-title">Total Holding &mdash; {row.isin}</span>
          <button className="um-close-btn" onClick={onClose} disabled={saving} aria-label="Close">&times;</button>
        </div>
        <div className="im-edit-listing-body">
          {errMsg && (
            <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>&#9888; {errMsg}</div>
          )}
          <div className="im-edit-listing-grid">
            <div className="im-edit-listing-field">
              <label htmlFor="th-value">Total Holding</label>
              <input
                id="th-value"
                type="number"
                min={0}
                step={1}
                className="im-input im-edit-listing-input"
                value={value}
                onChange={e => setValue(e.target.value)}
                disabled={saving}
                placeholder="Leave empty to clear"
              />
            </div>
          </div>
        </div>
        <div className="im-edit-listing-footer">
          <button className="btn-action btn-action--pink" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn-action btn-action--white" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default TotalHoldingModal;
