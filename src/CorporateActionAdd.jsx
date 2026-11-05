import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import { loadAllIsins } from './isinListCache';
import {
  CA_TYPE_OPTIONS,
  CA_TYPE_CODE_OPTIONS,
  CA_SUB_TYPE_OPTIONS,
  INDICATOR_OPTIONS,
  STAMP_DUTY_PAYABLE_OPTIONS,
  CALC_STAMP_DUTY_OPTIONS,
  EBP_NAME_OPTIONS,
  FUNDS_COLLECTED_OPTIONS,
  DEPOSITORY_OPTIONS,
} from './corporateActionOptions';

const MAX_VISIBLE = 100;

const DOWNLOAD_LINKS = [
  'NSDL', 'DNR', 'NSDL (Simultaneous)', 'DNR (Simultaneous)', 'CDSL', 'DNR',
];

function isinLabel(item) {
  return item.isinDescription
    ? `${item.isin} - ${item.isinDescription}`
    : item.isin;
}

// TODO: POST /admin/v1/corporate-actions
// payload: { isin, depository, caType, caTypeCode, caSubType, indicator,
//            stampDutyPayable, calculationOfStampDuty, ebpName, fundsCollected,
//            executionDate, allotmentDate, dnr, file (File object or null) }
async function createCorporateAction(/* payload */) {
  return null;
}

function CorporateActionAdd() {
  const navigate = useNavigate();

  // ── ISIN list ──────────────────────────────────────────────────────────────
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ── ISIN combobox (Company field) ──────────────────────────────────────────
  const [selectedIsin,   setSelectedIsin]   = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // ── Form fields ────────────────────────────────────────────────────────────
  const [depository,    setDepository]    = useState('NSDL');
  const [caType,        setCaType]        = useState('Normal');
  const [caTypeCode,    setCaTypeCode]    = useState('');
  const [caSubType,     setCaSubType]     = useState('');
  const [indicator,     setIndicator]     = useState('');
  const [stampDuty,     setStampDuty]     = useState('');
  const [calcStampDuty, setCalcStampDuty] = useState('00 - Not applicable');
  const [ebpName,       setEbpName]       = useState('00 - Not applicable');
  const [fundsCollected, setFundsCollected] = useState('00 - Not applicable');
  const [executionDate, setExecutionDate] = useState('');
  const [allotmentDate, setAllotmentDate] = useState('');
  const [fileName,      setFileName]      = useState('');
  const [fileObj,       setFileObj]       = useState(null);
  const [dnr,           setDnr]           = useState(false);

  // ── Validation & status ────────────────────────────────────────────────────
  const [errors,    setErrors]    = useState({});
  const [statusMsg, setStatusMsg] = useState('');

  const wrapRef     = useRef(null);
  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

  const filteredIsins = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    if (!q) return allIsins;
    return allIsins.filter(item =>
      item.isin?.toUpperCase().includes(q) ||
      item.isinDescription?.toUpperCase().includes(q)
    );
  }, [allIsins, filterText]);

  const visibleIsins = filteredIsins.slice(0, MAX_VISIBLE);
  const hasMore      = filteredIsins.length > MAX_VISIBLE;
  const displayValue = selectedIsin ? isinLabel(selectedIsin) : '';

  function openDropdown() {
    setFilterText('');
    setIsOpen(true);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  }

  function closeDropdown() {
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
  }

  function selectOption(item) {
    setSelectedIsin(item);
    setErrors(prev => ({ ...prev, isin: '' }));
    setIsOpen(false);
    setFilterText('');
    setHighlightedIdx(-1);
  }

  useEffect(() => {
    if (!isOpen || !listRef.current || highlightedIdx < 0) return;
    listRef.current.children[highlightedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen]);

  function handleKeyDown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.min(prev + 1, visibleIsins.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && highlightedIdx < visibleIsins.length) {
        selectOption(visibleIsins[highlightedIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setFileObj(f);
  }

  function validate() {
    const errs = {};
    if (!selectedIsin)       errs.isin          = 'Required';
    if (!depository)         errs.depository     = 'Required';
    if (!caType)             errs.caType         = 'Required';
    if (!caTypeCode)         errs.caTypeCode     = 'Required';
    if (!caSubType)          errs.caSubType      = 'Required';
    if (!indicator)          errs.indicator      = 'Required';
    if (!executionDate)      errs.executionDate  = 'Required';
    if (!allotmentDate)      errs.allotmentDate  = 'Required';
    return errs;
  }

  function handleAdd() {
    setStatusMsg('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      isin:                   selectedIsin.isin,
      depository,
      caType,
      caTypeCode,
      caSubType,
      indicator,
      stampDutyPayable:       stampDuty,
      calculationOfStampDuty: calcStampDuty,
      ebpName,
      fundsCollected,
      executionDate,
      allotmentDate,
      dnr,
      file:                   fileObj,
    };

    createCorporateAction(payload);
    setStatusMsg('Backend not connected yet');
  }

  function fieldErr(key) {
    return errors[key]
      ? { borderColor: '#d32f2f' }
      : {};
  }

  function clearErr(key) {
    setErrors(prev => ({ ...prev, [key]: '' }));
  }

  return (
    <div className="isin-master">
      <h1 className="page-heading">Add</h1>

      <div className="im-card">
        {/* Blue gradient header with download links */}
        <div className="im-card-header">
          <span>Corporate Action Details</span>
          <div className="ca-dl-links">
            {DOWNLOAD_LINKS.map((label, i) => (
              // TODO: wire each link to its real template download endpoint
              <span key={i} className="ca-dl-link" onClick={() => {}}>
                ↓ {label}
              </span>
            ))}
          </div>
        </div>

        {/* Status message after ADD */}
        {statusMsg && <div className="ca-status">{statusMsg}</div>}

        {/* 4-column form grid */}
        <div className="ca-form-grid">

          {/* Row 1 — Company (span 2) | Depository (span 2) */}

          {/* Company */}
          <div className="benpos-field ca-field-span2" ref={wrapRef}>
            <label className="benpos-label">Company</label>
            <div className="comp-combobox-wrap">
              <input
                ref={inputRef}
                className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}${errors.isin ? ' ca-input-error' : ''}`}
                style={fieldErr('isin')}
                type="text"
                value={isOpen ? filterText : displayValue}
                readOnly={!isOpen}
                placeholder={isOpen ? 'Type to filter…' : '— select ISIN —'}
                autoComplete="off"
                spellCheck={false}
                onChange={e => { if (!isOpen) return; setFilterText(e.target.value); setHighlightedIdx(-1); }}
                onClick={() => { if (!isOpen) openDropdown(); }}
                onKeyDown={handleKeyDown}
                onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget)) closeDropdown(); }}
              />
              <span
                className={`comp-combobox-arrow${isOpen ? ' comp-combobox-arrow--open' : ''}`}
                aria-hidden="true"
                onMouseDown={e => e.preventDefault()}
                onClick={() => (isOpen ? closeDropdown() : openDropdown())}
              >▾</span>
              {isOpen && (
                <ul className="comp-combobox-dropdown" ref={listRef}>
                  {isinsLoading ? (
                    <li className="comp-combobox-hint">Loading ISINs…</li>
                  ) : isinsError ? (
                    <li className="comp-combobox-hint comp-combobox-hint--error">{isinsError}</li>
                  ) : (
                    <>
                      {visibleIsins.map((item, i) => (
                        <li
                          key={item.isin}
                          className={`comp-combobox-option${i === highlightedIdx ? ' comp-combobox-option--highlighted' : ''}`}
                          onMouseDown={e => { e.preventDefault(); selectOption(item); }}
                          onMouseEnter={() => setHighlightedIdx(i)}
                        >
                          {isinLabel(item)}
                        </li>
                      ))}
                      {visibleIsins.length === 0 && (
                        <li className="comp-combobox-hint">No ISINs match</li>
                      )}
                      {hasMore && (
                        <li className="comp-combobox-hint">
                          Showing first {MAX_VISIBLE} of {filteredIsins.length.toLocaleString()} — type to narrow
                        </li>
                      )}
                    </>
                  )}
                </ul>
              )}
            </div>
            {errors.isin && <span className="ca-err">{errors.isin}</span>}
          </div>

          {/* Depository */}
          <div className="benpos-field ca-field-span2">
            <label className="benpos-label">Depository</label>
            <select
              className="benpos-select"
              style={fieldErr('depository')}
              value={depository}
              onChange={e => { setDepository(e.target.value); clearErr('depository'); }}
            >
              <option value="">— select —</option>
              {DEPOSITORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.depository && <span className="ca-err">{errors.depository}</span>}
          </div>

          {/* Row 2 — CA Type | CA Type Code | CA Sub Type | Indicator */}

          {/* CA Type */}
          <div className="benpos-field">
            <label className="benpos-label">CA Type</label>
            <select
              className="benpos-select"
              style={fieldErr('caType')}
              value={caType}
              onChange={e => { setCaType(e.target.value); clearErr('caType'); }}
            >
              <option value="">— select —</option>
              {CA_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.caType && <span className="ca-err">{errors.caType}</span>}
          </div>

          {/* CA Type Code */}
          <div className="benpos-field">
            <label className="benpos-label">CA Type Code</label>
            <select
              className="benpos-select"
              style={fieldErr('caTypeCode')}
              value={caTypeCode}
              onChange={e => { setCaTypeCode(e.target.value); clearErr('caTypeCode'); }}
            >
              <option value="">— select —</option>
              {CA_TYPE_CODE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.caTypeCode && <span className="ca-err">{errors.caTypeCode}</span>}
          </div>

          {/* CA Sub Type */}
          <div className="benpos-field">
            <label className="benpos-label">CA Sub Type</label>
            <select
              className="benpos-select"
              style={fieldErr('caSubType')}
              value={caSubType}
              onChange={e => { setCaSubType(e.target.value); clearErr('caSubType'); }}
            >
              <option value="">— select —</option>
              {CA_SUB_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.caSubType && <span className="ca-err">{errors.caSubType}</span>}
          </div>

          {/* Indicator */}
          <div className="benpos-field">
            <label className="benpos-label">Indicator</label>
            <select
              className="benpos-select"
              style={fieldErr('indicator')}
              value={indicator}
              onChange={e => { setIndicator(e.target.value); clearErr('indicator'); }}
            >
              <option value="">— select —</option>
              {INDICATOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            {errors.indicator && <span className="ca-err">{errors.indicator}</span>}
          </div>

          {/* Row 3 — Stamp Duty Payable | Calculation of Stamp Duty | EBP Name | Funds Collected */}

          {/* Stamp Duty Payable */}
          <div className="benpos-field">
            <label className="benpos-label">Stamp Duty Payable</label>
            <select
              className="benpos-select"
              value={stampDuty}
              onChange={e => setStampDuty(e.target.value)}
            >
              <option value="">— select —</option>
              {STAMP_DUTY_PAYABLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Calculation of Stamp Duty */}
          <div className="benpos-field">
            <label className="benpos-label">Calculation of Stamp Duty</label>
            <select
              className="benpos-select"
              value={calcStampDuty}
              onChange={e => setCalcStampDuty(e.target.value)}
            >
              <option value="">— select —</option>
              {CALC_STAMP_DUTY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* EBP Name */}
          <div className="benpos-field">
            <label className="benpos-label">EBP Name</label>
            <select
              className="benpos-select"
              value={ebpName}
              onChange={e => setEbpName(e.target.value)}
            >
              <option value="">— select —</option>
              {EBP_NAME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Funds Collected */}
          <div className="benpos-field">
            <label className="benpos-label">Funds Collected</label>
            <select
              className="benpos-select"
              value={fundsCollected}
              onChange={e => setFundsCollected(e.target.value)}
            >
              <option value="">— select —</option>
              {FUNDS_COLLECTED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Row 4 — Execution Date | Allotment Date | File | DNR */}

          {/* Execution Date */}
          <div className="benpos-field">
            <label className="benpos-label">Execution Date</label>
            <input
              type="date"
              className="benpos-date-input"
              style={fieldErr('executionDate')}
              value={executionDate}
              onChange={e => { setExecutionDate(e.target.value); clearErr('executionDate'); }}
            />
            {errors.executionDate && <span className="ca-err">{errors.executionDate}</span>}
          </div>

          {/* Allotment Date */}
          <div className="benpos-field">
            <label className="benpos-label">Allotment Date</label>
            <input
              type="date"
              className="benpos-date-input"
              style={fieldErr('allotmentDate')}
              value={allotmentDate}
              onChange={e => { setAllotmentDate(e.target.value); clearErr('allotmentDate'); }}
            />
            {errors.allotmentDate && <span className="ca-err">{errors.allotmentDate}</span>}
          </div>

          {/* File */}
          <div className="benpos-field">
            <label className="benpos-label">File</label>
            <div className="ca-file-wrap">
              <span className="ca-file-name">{fileName || 'No file chosen'}</span>
              <button
                type="button"
                className="ca-browse-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                ↑ Browse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* DNR toggle */}
          <div className="benpos-field" style={{ justifyContent: 'flex-end' }}>
            <label className="benpos-label">DNR</label>
            <div className="ca-dnr-wrap">
              <span
                className="ca-toggle-track"
                style={{ background: dnr ? '#e83e6f' : '#cdd3dd' }}
                onClick={() => setDnr(d => !d)}
              >
                <span
                  className="ca-toggle-knob"
                  style={{ left: dnr ? 20 : 2 }}
                />
              </span>
              <span style={{ fontSize: 13.5, color: '#3a4252' }}>DNR</span>
            </div>
          </div>

        </div>

        {/* ADD button */}
        <div className="ca-form-footer">
          <button
            className="btn-action btn-action--pink"
            onClick={handleAdd}
            style={{ borderRadius: 22, padding: '11px 38px', fontSize: 12.5 }}
          >
            ADD
          </button>
        </div>
      </div>
    </div>
  );
}

export default CorporateActionAdd;
