import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import './CorporateAction.css';
import { loadAllIsins } from './isinListCache';
import {
  createCa,
  createNsdlCa,
  downloadTemplate,
  downloadDnrTemplate,
  downloadNsdlTemplate,
  downloadNsdlDnrTemplate,
  getNsdlCodes,
  triggerDownload,
} from './services/corporateActionService';

const MAX_VISIBLE = 100;
const REQ = <span style={{ color: '#d32f2f', marginLeft: 2 }}>*</span>;

function isinLabel(item) {
  return item.isinDescription ? `${item.isin} - ${item.isinDescription}` : item.isin;
}

function fmtRowError(e) {
  const parts = [];
  if (e.sheet) parts.push(`${e.sheet} sheet`);
  if (e.row != null) parts.push(`Row ${e.row}`);
  const prefix = parts.join(', ');
  const detail = e.column ? `${e.column}: ${e.message}` : e.message;
  return prefix ? `${prefix} — ${detail}` : detail;
}

function CorporateActionAdd() {
  const navigate = useNavigate();

  // ── ISIN list ──────────────────────────────────────────────────────────────
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ── Main ISIN combobox (credit ISIN) ───────────────────────────────────────
  const [selectedIsin,   setSelectedIsin]   = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // ── Debit ISIN combobox (NSDL Simultaneous only) ──────────────────────────
  const [selectedDebitIsin,   setSelectedDebitIsin]   = useState(null);
  const [debitFilterText,     setDebitFilterText]     = useState('');
  const [debitIsOpen,         setDebitIsOpen]         = useState(false);
  const [debitHighlightedIdx, setDebitHighlightedIdx] = useState(-1);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [depository, setDepository] = useState('NSDL');

  // ── CDSL-specific ──────────────────────────────────────────────────────────
  const [caSeqNo,     setCaSeqNo]     = useState('');

  // ── File fields (shared between CDSL and NSDL) ────────────────────────────
  const [fileName,    setFileName]    = useState('');
  const [fileObj,     setFileObj]     = useState(null);
  const [dnr,         setDnr]         = useState(false);
  const [dnrFileName, setDnrFileName] = useState('');
  const [dnrFileObj,  setDnrFileObj]  = useState(null);

  // ── NSDL codes (from API) ─────────────────────────────────────────────────
  const [nsdlCodes,        setNsdlCodes]        = useState(null);
  const [nsdlCodesLoading, setNsdlCodesLoading] = useState(false);

  // ── NSDL fields ───────────────────────────────────────────────────────────
  const [nsdlMode,         setNsdlMode]         = useState('NORMAL');
  const [caTypeCode,       setCaTypeCode]       = useState('');
  const [caSubType,        setCaSubType]        = useState('');
  const [indicator,        setIndicator]        = useState('D');
  const [stampDutyPayable, setStampDutyPayable] = useState('N');
  const [stampDutyBasis,   setStampDutyBasis]   = useState('00');
  const [ebpName,          setEbpName]          = useState('00');
  const [fundsCollected,   setFundsCollected]   = useState('00');
  const [allotmentDate,    setAllotmentDate]    = useState('');
  const [executionDate,    setExecutionDate]    = useState('');
  const [rtaInternalRefNo, setRtaInternalRefNo] = useState('');

  // ── Status ─────────────────────────────────────────────────────────────────
  const [errors,     setErrors]     = useState({});
  const [rowErrors,  setRowErrors]  = useState([]);
  const [submitErr,  setSubmitErr]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  const wrapRef       = useRef(null);
  const inputRef      = useRef(null);
  const listRef       = useRef(null);
  const debitWrapRef  = useRef(null);
  const debitInputRef = useRef(null);
  const debitListRef  = useRef(null);
  const fileInputRef  = useRef(null);
  const dnrFileRef    = useRef(null);

  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

  // Load NSDL codes once when NSDL is selected
  useEffect(() => {
    if (depository !== 'NSDL' || nsdlCodes || nsdlCodesLoading) return;
    setNsdlCodesLoading(true);
    getNsdlCodes()
      .then(data => { setNsdlCodes(data); setNsdlCodesLoading(false); })
      .catch(() => setNsdlCodesLoading(false));
  }, [depository]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Main ISIN combobox ─────────────────────────────────────────────────────
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

  function openDropdown() { setFilterText(''); setIsOpen(true); setHighlightedIdx(-1); inputRef.current?.focus(); }
  function closeDropdown() { setIsOpen(false); setFilterText(''); setHighlightedIdx(-1); }
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
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHighlightedIdx(prev => Math.min(prev + 1, visibleIsins.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightedIdx(prev => Math.max(prev - 1, -1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); if (highlightedIdx >= 0 && highlightedIdx < visibleIsins.length) selectOption(visibleIsins[highlightedIdx]); }
    else if (e.key === 'Escape')    { e.preventDefault(); closeDropdown(); }
  }

  // ── Debit ISIN combobox ────────────────────────────────────────────────────
  const filteredDebitIsins = useMemo(() => {
    const q = debitFilterText.trim().toUpperCase();
    if (!q) return allIsins;
    return allIsins.filter(item =>
      item.isin?.toUpperCase().includes(q) ||
      item.isinDescription?.toUpperCase().includes(q)
    );
  }, [allIsins, debitFilterText]);

  const visibleDebitIsins = filteredDebitIsins.slice(0, MAX_VISIBLE);
  const hasMoreDebit       = filteredDebitIsins.length > MAX_VISIBLE;
  const debitDisplayValue  = selectedDebitIsin ? isinLabel(selectedDebitIsin) : '';

  function openDebitDropdown() { setDebitFilterText(''); setDebitIsOpen(true); setDebitHighlightedIdx(-1); debitInputRef.current?.focus(); }
  function closeDebitDropdown() { setDebitIsOpen(false); setDebitFilterText(''); setDebitHighlightedIdx(-1); }
  function selectDebitOption(item) {
    setSelectedDebitIsin(item);
    setErrors(prev => ({ ...prev, debitIsin: '' }));
    setDebitIsOpen(false);
    setDebitFilterText('');
    setDebitHighlightedIdx(-1);
  }

  useEffect(() => {
    if (!debitIsOpen || !debitListRef.current || debitHighlightedIdx < 0) return;
    debitListRef.current.children[debitHighlightedIdx]?.scrollIntoView({ block: 'nearest' });
  }, [debitHighlightedIdx, debitIsOpen]);

  function handleDebitKeyDown(e) {
    if (!debitIsOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDebitDropdown(); }
      return;
    }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setDebitHighlightedIdx(prev => Math.min(prev + 1, visibleDebitIsins.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setDebitHighlightedIdx(prev => Math.max(prev - 1, -1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); if (debitHighlightedIdx >= 0 && debitHighlightedIdx < visibleDebitIsins.length) selectDebitOption(visibleDebitIsins[debitHighlightedIdx]); }
    else if (e.key === 'Escape')    { e.preventDefault(); closeDebitDropdown(); }
  }

  // ── File handlers ──────────────────────────────────────────────────────────
  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setFileObj(f);
    setErrors(prev => ({ ...prev, file: '' }));
  }

  function handleDnrFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setDnrFileName(f.name);
    setDnrFileObj(f);
    setErrors(prev => ({ ...prev, dnrFile: '' }));
  }

  // ── Download handlers ──────────────────────────────────────────────────────
  async function handleDownloadTemplate() {
    try { const res = await downloadTemplate(); triggerDownload(res.data, 'ca_detail_template.xlsx'); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadDnrTemplate() {
    try { const res = await downloadDnrTemplate(); triggerDownload(res.data, 'ca_dnr_template.xlsx'); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadNsdlTemplate(mode) {
    try { const res = await downloadNsdlTemplate(mode); triggerDownload(res.data, `ca_nsdl_${mode.toLowerCase()}_template.xlsx`); }
    catch { alert('Failed to download template.'); }
  }

  async function handleDownloadNsdlDnrTemplate(mode) {
    try { const res = await downloadNsdlDnrTemplate(mode); triggerDownload(res.data, `ca_nsdl_${mode.toLowerCase()}_dnr_template.xlsx`); }
    catch { alert('Failed to download template.'); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fieldErr(key) { return errors[key] ? { borderColor: '#d32f2f' } : {}; }
  function clearErr(key) { setErrors(prev => ({ ...prev, [key]: '' })); }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validateCdsl() {
    const errs = {};
    if (!selectedIsin)                              errs.isin    = 'Required';
    if (!fileObj)                                   errs.file    = 'Required';
    if (dnr && !dnrFileObj)                        errs.dnrFile = 'Required';
    if (caSeqNo && !/^\d{0,6}$/.test(caSeqNo))    errs.caSeqNo = 'Digits only, max 6';
    return errs;
  }

  function validateNsdl() {
    const errs = {};
    if (!selectedIsin)                                              errs.isin          = 'Required';
    if (nsdlMode === 'SIMULTANEOUS' && !selectedDebitIsin)         errs.debitIsin     = 'Required';
    if (!caTypeCode)                                                errs.caTypeCode    = 'Required';
    if (!caSubType)                                                 errs.caSubType     = 'Required';
    if (nsdlMode === 'NORMAL' && !indicator)                       errs.indicator     = 'Required';
    if (!allotmentDate)                                             errs.allotmentDate = 'Required';
    if (!executionDate)                                             errs.executionDate = 'Required';
    if (!fileObj)                                                   errs.file          = 'Required';
    if (dnr && !dnrFileObj)                                        errs.dnrFile       = 'Required';
    return errs;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleAdd() {
    setRowErrors([]);
    setSubmitErr('');

    if (depository === 'CDSL') {
      const errs = validateCdsl();
      setErrors(errs);
      if (Object.keys(errs).length > 0) return;

      const fd = new FormData();
      fd.append('isin', selectedIsin.isin);
      if (caSeqNo.trim()) fd.append('caSeqNo', caSeqNo.trim());
      fd.append('file', fileObj);
      if (dnr && dnrFileObj) fd.append('dnrFile', dnrFileObj);

      setSubmitting(true);
      try {
        await createCa(fd);
        navigate('/corporate-action', { state: { successMsg: 'Corporate Action uploaded successfully.' } });
      } catch (err) {
        const details = err.response?.data?.error?.details;
        if (Array.isArray(details) && details.length > 0) setRowErrors(details);
        else setSubmitErr(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      } finally {
        setSubmitting(false);
      }
    } else {
      // NSDL
      const errs = validateNsdl();
      setErrors(errs);
      if (Object.keys(errs).length > 0) return;

      const fd = new FormData();
      fd.append('caTypeMode',       nsdlMode);
      fd.append('isin',             selectedIsin.isin);
      if (nsdlMode === 'SIMULTANEOUS') fd.append('debitIsin', selectedDebitIsin.isin);
      if (nsdlMode === 'NORMAL')       fd.append('indicator', indicator);
      fd.append('caTypeCode',       caTypeCode);
      fd.append('caSubType',        caSubType);
      fd.append('allotmentDate',    allotmentDate);
      fd.append('executionDate',    executionDate);
      fd.append('stampDutyPayable', stampDutyPayable);
      fd.append('stampDutyBasis',   stampDutyBasis);
      if (nsdlMode === 'NORMAL') {
        fd.append('ebpName',        ebpName);
        fd.append('fundsCollected', fundsCollected);
      }
      if (rtaInternalRefNo.trim()) fd.append('rtaInternalRefNo', rtaInternalRefNo.trim());
      fd.append('file', fileObj);
      if (dnr && dnrFileObj) fd.append('dnrFile', dnrFileObj);

      setSubmitting(true);
      try {
        await createNsdlCa(fd);
        navigate('/corporate-action', { state: { successMsg: 'Corporate Action uploaded successfully.' } });
      } catch (err) {
        const details = err.response?.data?.error?.details;
        if (Array.isArray(details) && details.length > 0) setRowErrors(details);
        else setSubmitErr(err.response?.data?.error?.message ?? err.message ?? 'Upload failed.');
      } finally {
        setSubmitting(false);
      }
    }
  }

  const isCdsl = depository === 'CDSL';

  // NSDL option lists (populated after codes load)
  const nsdlCaTypeCodes    = nsdlMode === 'NORMAL' ? (nsdlCodes?.caTypeCodes?.NORMAL ?? []) : (nsdlCodes?.caTypeCodes?.SIMULTANEOUS ?? []);
  const nsdlCaSubTypes     = nsdlCodes?.caSubTypes ?? [];
  const nsdlStampDutyBasis = nsdlCodes?.stampDutyBasis ?? [];
  const nsdlEbpNames       = nsdlCodes?.ebpNames ?? [];
  const nsdlFunds          = nsdlCodes?.fundsCollected ?? [];

  return (
    <div className="isin-master">
      <h1 className="page-heading">Add</h1>

      <div className="im-card">
        {/* Blue gradient header with download links */}
        <div className="im-card-header">
          <span>Corporate Action Details</span>
          <div className="ca-dl-links">
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlTemplate('NORMAL')}>↓ NSDL</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlDnrTemplate('NORMAL')}>↓ DNR</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlTemplate('SIMULTANEOUS')}>↓ NSDL (Simultaneous)</span>
            <span className="ca-dl-link" onClick={() => handleDownloadNsdlDnrTemplate('SIMULTANEOUS')}>↓ DNR (Simultaneous)</span>
            <span className="ca-dl-link" onClick={handleDownloadTemplate}>↓ CDSL</span>
            <span className="ca-dl-link" onClick={handleDownloadDnrTemplate}>↓ CDSL DNR</span>
          </div>
        </div>

        {/* Error messages */}
        {submitErr && (
          <div className="im-banner im-banner--error" style={{ margin: '10px 20px 0' }}>
            ⚠ {submitErr}
          </div>
        )}
        {rowErrors.length > 0 && (
          <div className="ca-row-errors-box">
            <div className="ca-row-errors-heading">Validation errors ({rowErrors.length}):</div>
            <ul className="ca-row-error-list">
              {rowErrors.map((e, i) => (
                <li key={i} className="ca-row-error-item">{fmtRowError(e)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 4-column form grid */}
        <div className="ca-form-grid">

          {/* Row 1 — Company (span 2) | Depository (span 2) */}
          <div className="benpos-field ca-field-span2" ref={wrapRef}>
            <label className="benpos-label">Company {REQ}</label>
            <div className="comp-combobox-wrap">
              <input
                ref={inputRef}
                className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}`}
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
                      {visibleIsins.length === 0 && <li className="comp-combobox-hint">No ISINs match</li>}
                      {hasMore && <li className="comp-combobox-hint">Showing first {MAX_VISIBLE} of {filteredIsins.length.toLocaleString()} — type to narrow</li>}
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
              value={depository}
              onChange={e => {
                setDepository(e.target.value);
                setErrors({});
                setRowErrors([]);
                setSubmitErr('');
                setFileName('');
                setFileObj(null);
                setDnrFileName('');
                setDnrFileObj(null);
                setDnr(false);
              }}
            >
              <option value="NSDL">NSDL</option>
              <option value="CDSL">CDSL</option>
            </select>
          </div>

          {/* ── CDSL-specific fields ── */}
          {isCdsl && (
            <>
              {/* CA Seq No */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">CA Seq No</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={fieldErr('caSeqNo')}
                  value={caSeqNo}
                  maxLength={6}
                  placeholder="optional"
                  onChange={e => { setCaSeqNo(e.target.value.replace(/[^0-9]/g, '')); clearErr('caSeqNo'); }}
                />
                <span className="ca-hint">Optional — digits only, max 6. You can fill it later.</span>
                {errors.caSeqNo && <span className="ca-err">{errors.caSeqNo}</span>}
              </div>

              <div className="benpos-field ca-field-span2" />

              {/* File */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">File (.xlsx) {REQ}</label>
                <div className={`ca-file-wrap${errors.file ? ' ca-file-wrap--error' : ''}`}>
                  <span className="ca-file-name">{fileName || 'No file chosen'}</span>
                  <button type="button" className="ca-browse-btn" onClick={() => fileInputRef.current?.click()}>↑ Browse</button>
                  <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
                {errors.file && <span className="ca-err">{errors.file}</span>}
              </div>

              {/* DNR toggle */}
              <div className="benpos-field ca-field-span2" style={{ justifyContent: 'flex-end' }}>
                <label className="benpos-label">DNR</label>
                <div className="ca-dnr-wrap">
                  <span
                    className="ca-toggle-track"
                    style={{ background: dnr ? '#e83e6f' : '#cdd3dd' }}
                    onClick={() => { setDnr(d => !d); clearErr('dnrFile'); }}
                  >
                    <span className="ca-toggle-knob" style={{ left: dnr ? 20 : 2 }} />
                  </span>
                  <span style={{ fontSize: 13.5, color: '#3a4252' }}>DNR</span>
                </div>
              </div>

              {/* DNR File */}
              {dnr && (
                <>
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">DNR File (.xlsx) {REQ}</label>
                    <div className={`ca-file-wrap${errors.dnrFile ? ' ca-file-wrap--error' : ''}`}>
                      <span className="ca-file-name">{dnrFileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => dnrFileRef.current?.click()}>↑ Browse</button>
                      <input ref={dnrFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleDnrFileChange} />
                    </div>
                    {errors.dnrFile && <span className="ca-err">{errors.dnrFile}</span>}
                  </div>
                  <div className="benpos-field ca-field-span2" />
                </>
              )}
            </>
          )}

          {/* ── NSDL fields ── */}
          {!isCdsl && (
            <>
              {/* Corporate Action (Normal / Simultaneous mode) */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">Corporate Action</label>
                <select
                  className="benpos-select"
                  value={nsdlMode}
                  onChange={e => { setNsdlMode(e.target.value); setCaTypeCode(''); clearErr('caTypeCode'); }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="SIMULTANEOUS">Simultaneous</option>
                </select>
              </div>

              {/* Debit ISIN — Simultaneous only */}
              {nsdlMode === 'SIMULTANEOUS' && (
                <div className="benpos-field ca-field-span2" ref={debitWrapRef}>
                  <label className="benpos-label">Debit ISIN {REQ}</label>
                  <div className="comp-combobox-wrap">
                    <input
                      ref={debitInputRef}
                      className={`comp-combobox-input${debitIsOpen ? ' comp-combobox-input--open' : ''}`}
                      style={fieldErr('debitIsin')}
                      type="text"
                      value={debitIsOpen ? debitFilterText : debitDisplayValue}
                      readOnly={!debitIsOpen}
                      placeholder={debitIsOpen ? 'Type to filter…' : '— select debit ISIN —'}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={e => { if (!debitIsOpen) return; setDebitFilterText(e.target.value); setDebitHighlightedIdx(-1); }}
                      onClick={() => { if (!debitIsOpen) openDebitDropdown(); }}
                      onKeyDown={handleDebitKeyDown}
                      onBlur={e => { if (!debitWrapRef.current?.contains(e.relatedTarget)) closeDebitDropdown(); }}
                    />
                    <span
                      className={`comp-combobox-arrow${debitIsOpen ? ' comp-combobox-arrow--open' : ''}`}
                      aria-hidden="true"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => (debitIsOpen ? closeDebitDropdown() : openDebitDropdown())}
                    >▾</span>
                    {debitIsOpen && (
                      <ul className="comp-combobox-dropdown" ref={debitListRef}>
                        {isinsLoading ? (
                          <li className="comp-combobox-hint">Loading ISINs…</li>
                        ) : isinsError ? (
                          <li className="comp-combobox-hint comp-combobox-hint--error">{isinsError}</li>
                        ) : (
                          <>
                            {visibleDebitIsins.map((item, i) => (
                              <li
                                key={item.isin}
                                className={`comp-combobox-option${i === debitHighlightedIdx ? ' comp-combobox-option--highlighted' : ''}`}
                                onMouseDown={e => { e.preventDefault(); selectDebitOption(item); }}
                                onMouseEnter={() => setDebitHighlightedIdx(i)}
                              >
                                {isinLabel(item)}
                              </li>
                            ))}
                            {visibleDebitIsins.length === 0 && <li className="comp-combobox-hint">No ISINs match</li>}
                            {hasMoreDebit && <li className="comp-combobox-hint">Showing first {MAX_VISIBLE} of {filteredDebitIsins.length.toLocaleString()} — type to narrow</li>}
                          </>
                        )}
                      </ul>
                    )}
                  </div>
                  {errors.debitIsin && <span className="ca-err">{errors.debitIsin}</span>}
                </div>
              )}

              {/* Spacer when Normal (keep grid aligned) */}
              {nsdlMode === 'NORMAL' && <div className="benpos-field ca-field-span2" />}

              {/* CA Type Code */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">CA Type Code {REQ}</label>
                <select
                  className="benpos-select"
                  style={fieldErr('caTypeCode')}
                  value={caTypeCode}
                  onChange={e => { setCaTypeCode(e.target.value); clearErr('caTypeCode'); }}
                  disabled={nsdlCodesLoading}
                >
                  <option value="">— select —</option>
                  {nsdlCaTypeCodes.map(o => (
                    <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                  ))}
                </select>
                {errors.caTypeCode && <span className="ca-err">{errors.caTypeCode}</span>}
              </div>

              {/* CA Sub Type */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">CA Sub Type {REQ}</label>
                <select
                  className="benpos-select"
                  style={fieldErr('caSubType')}
                  value={caSubType}
                  onChange={e => { setCaSubType(e.target.value); clearErr('caSubType'); }}
                  disabled={nsdlCodesLoading}
                >
                  <option value="">— select —</option>
                  {nsdlCaSubTypes.map(o => (
                    <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                  ))}
                </select>
                {errors.caSubType && <span className="ca-err">{errors.caSubType}</span>}
              </div>

              {/* Indicator — Normal only */}
              {nsdlMode === 'NORMAL' && (
                <div className="benpos-field ca-field-span2">
                  <label className="benpos-label">Indicator {REQ}</label>
                  <select
                    className="benpos-select"
                    style={fieldErr('indicator')}
                    value={indicator}
                    onChange={e => { setIndicator(e.target.value); clearErr('indicator'); }}
                  >
                    <option value="D">D — Debit</option>
                    <option value="C">C — Credit</option>
                  </select>
                  {errors.indicator && <span className="ca-err">{errors.indicator}</span>}
                </div>
              )}

              {/* Stamp Duty Payable */}
              <div className={`benpos-field${nsdlMode === 'NORMAL' ? '' : ' ca-field-span2'}`}>
                <label className="benpos-label">Stamp Duty Payable {REQ}</label>
                <select
                  className="benpos-select"
                  value={stampDutyPayable}
                  onChange={e => setStampDutyPayable(e.target.value)}
                >
                  <option value="Y">Y — Yes</option>
                  <option value="N">N — No</option>
                </select>
              </div>

              {/* Stamp Duty Basis */}
              <div className={`benpos-field${nsdlMode === 'SIMULTANEOUS' ? '' : ''}`} style={nsdlMode === 'SIMULTANEOUS' ? {} : {}}>
                <label className="benpos-label">Stamp Duty Basis {REQ}</label>
                <select
                  className="benpos-select"
                  value={stampDutyBasis}
                  onChange={e => setStampDutyBasis(e.target.value)}
                  disabled={nsdlCodesLoading}
                >
                  {nsdlStampDutyBasis.map(o => (
                    <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                  ))}
                </select>
              </div>

              {/* EBP Name — Normal only */}
              {nsdlMode === 'NORMAL' && (
                <div className="benpos-field ca-field-span2">
                  <label className="benpos-label">EBP Name {REQ}</label>
                  <select
                    className="benpos-select"
                    value={ebpName}
                    onChange={e => setEbpName(e.target.value)}
                    disabled={nsdlCodesLoading}
                  >
                    {nsdlEbpNames.map(o => (
                      <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Funds Collected — Normal only */}
              {nsdlMode === 'NORMAL' && (
                <div className="benpos-field ca-field-span2">
                  <label className="benpos-label">Funds Collected {REQ}</label>
                  <select
                    className="benpos-select"
                    value={fundsCollected}
                    onChange={e => setFundsCollected(e.target.value)}
                    disabled={nsdlCodesLoading}
                  >
                    {nsdlFunds.map(o => (
                      <option key={o.code} value={o.code}>{o.code} - {o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Allotment Date */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">Allotment Date {REQ}</label>
                <input
                  type="date"
                  className="benpos-date-input"
                  style={fieldErr('allotmentDate')}
                  value={allotmentDate}
                  onChange={e => { setAllotmentDate(e.target.value); clearErr('allotmentDate'); }}
                />
                {errors.allotmentDate && <span className="ca-err">{errors.allotmentDate}</span>}
              </div>

              {/* Execution Date */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">Execution Date {REQ}</label>
                <input
                  type="date"
                  className="benpos-date-input"
                  style={fieldErr('executionDate')}
                  value={executionDate}
                  onChange={e => { setExecutionDate(e.target.value); clearErr('executionDate'); }}
                />
                {errors.executionDate && <span className="ca-err">{errors.executionDate}</span>}
              </div>

              {/* RTA Internal Ref No */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">RTA Internal Ref No</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  value={rtaInternalRefNo}
                  maxLength={16}
                  placeholder="optional — auto-generated if blank"
                  onChange={e => setRtaInternalRefNo(e.target.value)}
                />
                <span className="ca-hint">Optional — auto-generated if left blank.</span>
              </div>

              <div className="benpos-field ca-field-span2" />

              {/* File */}
              <div className="benpos-field ca-field-span2">
                <label className="benpos-label">File (.xlsx) {REQ}</label>
                <div className={`ca-file-wrap${errors.file ? ' ca-file-wrap--error' : ''}`}>
                  <span className="ca-file-name">{fileName || 'No file chosen'}</span>
                  <button type="button" className="ca-browse-btn" onClick={() => fileInputRef.current?.click()}>↑ Browse</button>
                  <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
                {errors.file && <span className="ca-err">{errors.file}</span>}
              </div>

              {/* DNR toggle */}
              <div className="benpos-field ca-field-span2" style={{ justifyContent: 'flex-end' }}>
                <label className="benpos-label">DNR</label>
                <div className="ca-dnr-wrap">
                  <span
                    className="ca-toggle-track"
                    style={{ background: dnr ? '#e83e6f' : '#cdd3dd' }}
                    onClick={() => { setDnr(d => !d); clearErr('dnrFile'); }}
                  >
                    <span className="ca-toggle-knob" style={{ left: dnr ? 20 : 2 }} />
                  </span>
                  <span style={{ fontSize: 13.5, color: '#3a4252' }}>DNR</span>
                </div>
              </div>

              {/* DNR File */}
              {dnr && (
                <>
                  <div className="benpos-field ca-field-span2">
                    <label className="benpos-label">DNR File (.xlsx) {REQ}</label>
                    <div className={`ca-file-wrap${errors.dnrFile ? ' ca-file-wrap--error' : ''}`}>
                      <span className="ca-file-name">{dnrFileName || 'No file chosen'}</span>
                      <button type="button" className="ca-browse-btn" onClick={() => dnrFileRef.current?.click()}>↑ Browse</button>
                      <input ref={dnrFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleDnrFileChange} />
                    </div>
                    {errors.dnrFile && <span className="ca-err">{errors.dnrFile}</span>}
                  </div>
                  <div className="benpos-field ca-field-span2" />
                </>
              )}
            </>
          )}

        </div>

        {/* ADD button */}
        <div className="ca-form-footer">
          <button
            className="btn-action btn-action--pink"
            onClick={handleAdd}
            disabled={submitting}
            style={{ borderRadius: 22, padding: '11px 38px', fontSize: 12.5 }}
          >
            {submitting ? 'Uploading…' : 'ADD'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CorporateActionAdd;
