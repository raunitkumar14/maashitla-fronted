import { useState, useEffect, useRef, useMemo } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import './Comparison.css';
import { loadAllIsins } from './isinListCache';
import api from './api/axios';
import { buildXlsxBlob } from './xlsxStream';

const MAX_VISIBLE    = 100;
const EVSN_RE        = /^\d{9}$/;          // CDSL: exactly 9 digits
const BATCH_NSDL_RE  = /^\d{7}$/;          // NSDL: exactly 7 digits
const SHRID_RE       = /^[A-Z0-9]{8}$/;    // NSDL: 8 uppercase alphanumeric chars
const NSDL_EVEN_RE   = /^\d{1,12}$/;       // NSDL: 1–12 digits
const CRLF           = '\r\n';

function fmtDDMMYYYY(iso) {
  if (!iso || iso.length < 10) return iso || '';
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function isinLabel(item) {
  return item.isinDescription
    ? `${item.isin} - ${item.isinDescription}`
    : item.isin;
}

function downloadBlob(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function nowStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`,
    time: `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`,
  };
}

// CDSL: every data line (01=...) must split into exactly 23 fields (22 ~ separators).
function check23Fields(lines) {
  const dataLines = lines.filter(l => l.startsWith('01='));
  const bad = dataLines.filter(l => l.split('~').length !== 23);
  return { ok: bad.length === 0, badCount: bad.length, total: dataLines.length, type: 'cdsl' };
}

// NSDL: every detail line (field[1] === '12') must split into exactly 19 fields (18 ^ separators).
function check19Fields(lines) {
  const dataLines = lines.filter(l => l.split('^')[1] === '12');
  const bad = dataLines.filter(l => l.split('^').length !== 19);
  return { ok: bad.length === 0, badCount: bad.length, total: dataLines.length, type: 'nsdl' };
}

function buildCdslText(rows, isin, evsn) {
  const lines = [];
  lines.push(`00=${rows.length}~${isin}~${evsn}`);
  rows.forEach((row, i) => {
    const seq        = i + 1;
    const memberType = row.source === 'PHYSICAL' ? 'P' : 'D';
    const shares     = row.shares != null
      ? (typeof row.shares === 'number' ? row.shares.toFixed(3) : String(row.shares))
      : '';
    // 23 fields / 22 separators:
    // 01=seq ~ memberType ~ boid ~ pan ~ uid(blank) ~ subStatus ~ shares
    //   ~ name1 ~ name2 ~ name3 ~ address1(blank) ~ address2(blank)
    //   ~ address3(blank) ~ city(blank) ~ state(blank) ~ country(blank)
    //   ~ pin(blank) ~ dob(blank) ~ bank(blank) ~ mobile(blank)
    //   ~ email(blank) ~ blockFlag(blank) ~ blockReason(blank)
    lines.push(
      `01=${seq}~${memberType}~${row.boid ?? ''}~${row.pan ?? ''}~~${row.subStatus ?? ''}~${shares}~${row.name1 ?? ''}~${row.name2 ?? ''}~${row.name3 ?? ''}~~~~~~~~~~~~~`
    );
  });
  return { text: lines.join(CRLF), check: check23Fields(lines) };
}

function buildNsdlText(rows, batch, shrId, isin, cutOffDate, even) {
  // cutOffDate is YYYY-MM-DD from the date input; file needs YYYYMMDD
  const cutoff = cutOffDate.replace(/-/g, '');
  const lines  = [];
  lines.push('{}');
  lines.push(`${batch}^11^${shrId}^${isin}^${cutoff}^${rows.length}^${even}`);
  rows.forEach(row => {
    const h18 = row.holdings18 != null
      ? (typeof row.holdings18 === 'number'
          ? String(row.holdings18).padStart(18, '0')
          : String(row.holdings18))
      : '000000000000000000';
    const rawEmail = String(row.email ?? '').replace(/[\s^]/g, '');
    const email    = rawEmail.length > 50 ? '' : rawEmail;
    // 19 fields / 18 ^ separators:
    // batch ^ 12 ^ depType ^ accountNo ^ name1 ^ PAN1(blank) ^ name2(blank) ^ PAN2(blank)
    //   ^ name3(blank) ^ PAN3(blank) ^ address1 ^ address2(blank) ^ address3(blank)
    //   ^ address4(blank) ^ pin ^ mobile(blank) ^ email ^ holdings18 ^ clientType
    lines.push(
      `${batch}^12^${row.depType ?? ''}^${row.accountNo ?? ''}^${row.name1 ?? ''}^^^^^^${row.address1 ?? ''}^^^^${row.pin ?? ''}^^${email}^${h18}^${row.clientType ?? ''}`
    );
  });
  lines.push('{}');
  return { text: lines.join(CRLF), check: check19Fields(lines) };
}

const DEPOSITORY_OPTIONS = ['CDSL', 'NSDL'];

function EVoting() {
  // ── ISIN list ──────────────────────────────────────────────────────────────
  const [allIsins,     setAllIsins]     = useState([]);
  const [isinsLoading, setIsinsLoading] = useState(true);
  const [isinsError,   setIsinsError]   = useState('');

  // ── Combobox ───────────────────────────────────────────────────────────────
  const [selectedIsin,   setSelectedIsin]   = useState(null);
  const [filterText,     setFilterText]     = useState('');
  const [isOpen,         setIsOpen]         = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // ── Shared form fields ─────────────────────────────────────────────────────
  const [depository, setDepository] = useState('');
  const [evsn,       setEvsn]       = useState(''); // CDSL: EVSN (9 digits) | NSDL: Batch Number (7 digits)
  const [benposDate, setBenposDate] = useState('');

  // ── NSDL-only form fields ──────────────────────────────────────────────────
  const [shrId,         setShrId]         = useState('');
  const [nsdlEven,      setNsdlEven]      = useState('');
  const [nsdlCutOffDate, setNsdlCutOffDate] = useState('');

  // ── Date list ──────────────────────────────────────────────────────────────
  const [benposDates,  setBenposDates]  = useState([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [datesError,   setDatesError]   = useState('');

  // ── Generation state ───────────────────────────────────────────────────────
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState('');
  const [summary,     setSummary]     = useState(null);
  const [skippedRows, setSkippedRows] = useState([]);
  const [checkResult, setCheckResult] = useState(null);

  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  // Load all ISINs once
  useEffect(() => {
    loadAllIsins()
      .then(list => { setAllIsins(list); setIsinsLoading(false); })
      .catch(() => { setIsinsError('Could not load ISINs.'); setIsinsLoading(false); });
  }, []);

  // Reload dates when ISIN changes; reset selected date and result state
  useEffect(() => {
    setBenposDates([]);
    setBenposDate('');
    setDatesError('');
    setSummary(null);
    setGenError('');
    setCheckResult(null);
    if (!selectedIsin) return;
    setDatesLoading(true);
    api.get('/admin/v1/evoting/dates', { params: { isin: selectedIsin.isin } })
      .then(res => {
        setBenposDates(res.data?.dates ?? res.data?.data?.dates ?? []);
        setDatesLoading(false);
      })
      .catch(err => {
        setDatesError(err.response?.data?.error?.message ?? err.message ?? 'Could not load dates.');
        setDatesLoading(false);
      });
  }, [selectedIsin]);

  // ── Combobox filtering ─────────────────────────────────────────────────────
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

  // ── Validation ─────────────────────────────────────────────────────────────
  const evsnValid = depository === 'CDSL'
    ? EVSN_RE.test(evsn.trim())
    : depository === 'NSDL'
      ? (BATCH_NSDL_RE.test(evsn.trim()) && evsn.trim() !== '0000000')
      : false;

  const shrIdValid   = SHRID_RE.test(shrId);
  const nsdlEvenValid = NSDL_EVEN_RE.test(nsdlEven.trim());

  const canGenerate = depository === 'CDSL'
    ? !!(selectedIsin && benposDate && evsnValid)
    : depository === 'NSDL'
      ? !!(selectedIsin && benposDate && evsnValid && shrIdValid && nsdlEvenValid && nsdlCutOffDate)
      : false;

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setSummary(null);
    setGenError('');
    setSkippedRows([]);
    setCheckResult(null);

    if (depository === 'NSDL') {
      setGenerating(true);
      try {
        const res  = await api.get('/admin/v1/evoting/nsdl-data', {
          params: { isin: selectedIsin.isin, date: benposDate },
        });
        const data             = res.data?.data ?? res.data ?? {};
        const rows             = data.rows ?? [];
        const skipped          = data.skipped ?? [];
        const counts           = data.counts ?? {};
        const unclassifiedCount = data.unclassifiedCount ?? 0;

        if (rows.length === 0) {
          setSummary({ empty: true, skippedCount: skipped.length, unclassifiedCount, depository: 'NSDL' });
          setSkippedRows(skipped);
          return;
        }

        // Sort: holdings desc (zero-padded equal-length → string ≡ numeric order),
        // then accountNo asc, then name1 asc as stable tie-break.
        rows.sort((a, b) => {
          const hA = a.holdings18 ?? '000000000000000000';
          const hB = b.holdings18 ?? '000000000000000000';
          if (hB > hA) return 1;
          if (hB < hA) return -1;
          const acA = a.accountNo ?? '';
          const acB = b.accountNo ?? '';
          if (acA < acB) return -1;
          if (acA > acB) return 1;
          return (a.name1 ?? '') < (b.name1 ?? '') ? -1 : 1;
        });

        const { text, check } = buildNsdlText(
          rows, evsn.trim(), shrId.trim(), selectedIsin.isin, nsdlCutOffDate, nsdlEven.trim()
        );
        setCheckResult(check);

        const { date: dt, time: tm } = nowStamp();
        downloadBlob(
          new Blob([text], { type: 'text/plain;charset=utf-8' }),
          `EVOTE_${dt}_${tm}_NSDL.txt`
        );

        const cdslCount  = counts.cdsl   ?? rows.filter(r => r.depType === 'C').length;
        const nsdlCount  = counts.nsdl   ?? rows.filter(r => r.depType === 'N').length;
        const physCount  = counts.physical ?? rows.filter(r => r.depType === 'P').length;
        const totalShares = rows.reduce((s, r) => s + (parseFloat(r.shares) || 0), 0);

        setSummary({
          cdsl: cdslCount, nsdl: nsdlCount, physical: physCount,
          total: rows.length, totalShares,
          skippedCount: skipped.length, unclassifiedCount,
          depository: 'NSDL',
        });
        setSkippedRows(skipped);
      } catch (err) {
        setGenError(err.response?.data?.error?.message ?? err.message ?? 'Generation failed.');
      } finally {
        setGenerating(false);
      }
      return;
    }

    // CDSL path
    setGenerating(true);
    try {
      const res  = await api.get('/admin/v1/evoting/data', {
        params: { isin: selectedIsin.isin, date: benposDate },
      });
      const data         = res.data?.data ?? res.data ?? {};
      const rows         = data.rows ?? [];
      const skipped      = data.skipped ?? [];
      const fallbackCount = data.fallbackSubStatusCount ?? 0;

      if (rows.length === 0) {
        setSummary({ empty: true, skippedCount: skipped.length, fallbackCount, depository: 'CDSL' });
        setSkippedRows(skipped);
        return;
      }

      // Sort: shares desc (numeric), then boid asc, then name1 asc as stable tie-break.
      rows.sort((a, b) => {
        const sA = parseFloat(a.shares) || 0;
        const sB = parseFloat(b.shares) || 0;
        if (sB !== sA) return sB - sA;
        const boA = a.boid ?? '';
        const boB = b.boid ?? '';
        if (boA < boB) return -1;
        if (boA > boB) return 1;
        return (a.name1 ?? '') < (b.name1 ?? '') ? -1 : 1;
      });

      const { text, check } = buildCdslText(rows, selectedIsin.isin, evsn.trim());
      setCheckResult(check);

      const { date: dt, time: tm } = nowStamp();
      downloadBlob(
        new Blob([text], { type: 'text/plain;charset=utf-8' }),
        `EVOTE_${dt}_${tm}_CDSL.txt`
      );

      const cdslCount  = rows.filter(r => r.source === 'CDSL').length;
      const nsdlCount  = rows.filter(r => r.source === 'NSDL').length;
      const physCount  = rows.filter(r => r.source === 'PHYSICAL').length;
      const totalShares = rows.reduce((s, r) => s + (parseFloat(r.shares) || 0), 0);

      setSummary({
        cdsl: cdslCount, nsdl: nsdlCount, physical: physCount,
        total: rows.length, totalShares,
        skippedCount: skipped.length, fallbackCount,
        depository: 'CDSL',
      });
      setSkippedRows(skipped);
    } catch (err) {
      setGenError(err.response?.data?.error?.message ?? err.message ?? 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadSkipped() {
    const { date: dt } = nowStamp();
    let headers, excelRows;
    if (depository === 'NSDL') {
      headers = ['Depository', 'Account No', 'Name', 'Shares', 'Reason'];
      excelRows = skippedRows.map(r => [
        r.depType ?? '', r.accountNo ?? '', r.name1 ?? '', r.shares ?? '', r.reason ?? '',
      ]);
    } else {
      headers = ['Source', 'BOID/Folio', 'PAN', 'Name', 'Shares', 'Reason'];
      excelRows = skippedRows.map(r => [
        r.source ?? '', r.boid ?? '', r.pan ?? '', r.name1 ?? '', r.shares ?? '', r.reason ?? '',
      ]);
    }
    const blob = await buildXlsxBlob(headers, excelRows, {
      sheetName: 'Skipped', headerFill: 'FFE0B2', freezeTopRow: true,
    });
    downloadBlob(blob, `EVOTE_SKIPPED_${dt}.xlsx`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="isin-master">
      <h1 className="page-heading">Evoting</h1>

      {/* ── Form card ── */}
      <div className="im-card">
        <div className="im-card-header"><span>E-Voting</span></div>

        <div className="benpos-filter-body">

          {/* Row 1: ISIN + Depository */}
          <div className="benpos-filter-row">

            <div className="benpos-field comp-isin-field" ref={wrapRef}>
              <label className="benpos-label">ISIN</label>
              <div className="comp-combobox-wrap">
                <input
                  ref={inputRef}
                  className={`comp-combobox-input${isOpen ? ' comp-combobox-input--open' : ''}`}
                  type="text"
                  value={isOpen ? filterText : displayValue}
                  readOnly={!isOpen}
                  placeholder={isOpen ? 'Type to filter…' : '— select ISIN —'}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => {
                    if (!isOpen) return;
                    setFilterText(e.target.value);
                    setHighlightedIdx(-1);
                  }}
                  onClick={() => { if (!isOpen) openDropdown(); }}
                  onKeyDown={handleKeyDown}
                  onBlur={e => {
                    if (!wrapRef.current?.contains(e.relatedTarget)) closeDropdown();
                  }}
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
            </div>

            <div className="benpos-field" style={{ width: 180 }}>
              <label className="benpos-label">Depository</label>
              <select
                className="benpos-select"
                value={depository}
                onChange={e => {
                  setDepository(e.target.value);
                  setEvsn('');
                  setBenposDate('');
                  setSummary(null);
                  setGenError('');
                  setCheckResult(null);
                }}
              >
                <option value="">— select —</option>
                {DEPOSITORY_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Row 2: depository-specific inputs + Date */}
          <div className="benpos-filter-row">

            {/* CDSL: EVSN (Batch Number, 9 digits) */}
            {depository === 'CDSL' && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">EVSN (Batch Number)</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={evsn.trim() && !evsnValid ? { borderColor: '#d32f2f' } : undefined}
                  value={evsn}
                  maxLength={9}
                  placeholder="9 digits"
                  onChange={e => setEvsn(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
                {evsn.trim() && !evsnValid && (
                  <span className="benpos-date-note benpos-date-note--error">9 digits required</span>
                )}
              </div>
            )}

            {/* NSDL: Batch Number (7 digits, not all zeros) */}
            {depository === 'NSDL' && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">Batch Number</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={evsn.trim() && !evsnValid ? { borderColor: '#d32f2f' } : undefined}
                  value={evsn}
                  maxLength={7}
                  placeholder="7 digits"
                  onChange={e => setEvsn(e.target.value.replace(/\D/g, '').slice(0, 7))}
                />
                {evsn.trim() && !evsnValid && (
                  <span className="benpos-date-note benpos-date-note--error">
                    {evsn.trim() === '0000000' ? 'Cannot be all zeros' : '7 digits required'}
                  </span>
                )}
              </div>
            )}

            {/* NSDL: SHR ID (8 chars, alphanumeric, uppercase) */}
            {depository === 'NSDL' && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">SHR ID</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={shrId && !shrIdValid ? { borderColor: '#d32f2f' } : undefined}
                  value={shrId}
                  maxLength={8}
                  placeholder="8 chars"
                  onChange={e => setShrId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                />
                {shrId && !shrIdValid && (
                  <span className="benpos-date-note benpos-date-note--error">8 alphanumeric chars</span>
                )}
              </div>
            )}

            {/* NSDL: EVEN (digits only, max 12) */}
            {depository === 'NSDL' && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">EVEN</label>
                <input
                  type="text"
                  className="benpos-date-input"
                  style={nsdlEven.trim() && !nsdlEvenValid ? { borderColor: '#d32f2f' } : undefined}
                  value={nsdlEven}
                  maxLength={12}
                  placeholder="up to 12 digits"
                  onChange={e => setNsdlEven(e.target.value.replace(/\D/g, '').slice(0, 12))}
                />
                {nsdlEven.trim() && !nsdlEvenValid && (
                  <span className="benpos-date-note benpos-date-note--error">Digits only, max 12</span>
                )}
              </div>
            )}

            {/* NSDL: Cut Off Date */}
            {depository === 'NSDL' && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">Cut Off Date</label>
                <input
                  type="date"
                  className="benpos-date-input"
                  value={nsdlCutOffDate}
                  onChange={e => setNsdlCutOffDate(e.target.value)}
                />
              </div>
            )}

            {/* Date dropdown (both depositories) */}
            {depository && (
              <div className="benpos-field benpos-field--date">
                <label className="benpos-label">Date</label>
                {!selectedIsin ? (
                  <select className="benpos-select" disabled>
                    <option>Select an ISIN first</option>
                  </select>
                ) : datesLoading ? (
                  <select className="benpos-select" disabled>
                    <option>Loading…</option>
                  </select>
                ) : benposDates.length === 0 ? (
                  <select className="benpos-select" disabled>
                    <option>No dates available</option>
                  </select>
                ) : (
                  <select
                    className="benpos-select"
                    value={benposDate}
                    onChange={e => {
                      setBenposDate(e.target.value);
                      setSummary(null);
                      setGenError('');
                      setCheckResult(null);
                    }}
                  >
                    <option value="">— select date —</option>
                    {benposDates.map(d => (
                      <option key={d} value={d}>{fmtDDMMYYYY(d)}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

          </div>

          {/* Row 3: Generate button */}
          <div className="benpos-filter-row benpos-filter-row--actions">
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? '⏳ Generating…' : 'GENERATE'}
            </button>
          </div>

          {!datesLoading && datesError && (
            <div className="im-banner im-banner--error">⚠ {datesError}</div>
          )}
          {genError && (
            <div className="im-banner im-banner--error">⚠ {genError}</div>
          )}
          {checkResult && (
            <div className={`im-banner ${checkResult.ok ? 'im-banner--success' : 'im-banner--error'}`}>
              {checkResult.type === 'nsdl'
                ? (checkResult.ok
                    ? `✓ 19-field check passed — all ${checkResult.total} row${checkResult.total !== 1 ? 's' : ''} verified`
                    : `⚠ 19-field check: ${checkResult.badCount} of ${checkResult.total} rows do not have 19 fields`)
                : (checkResult.ok
                    ? `✓ 23-field check passed — all ${checkResult.total} row${checkResult.total !== 1 ? 's' : ''} verified`
                    : `⚠ 23-field check: ${checkResult.badCount} of ${checkResult.total} rows do not have 23 fields`)}
            </div>
          )}

        </div>
      </div>

      {/* ── Result / summary card ── */}
      {summary && (
        <div className="im-card">
          <div className="im-card-header"><span>Generation Result</span></div>

          {summary.empty && (
            <div className="benpos-filter-body">
              <div className="im-banner im-banner--info">ℹ No holders found for this ISIN and date</div>
              {skippedRows.length > 0 && (
                <button className="btn-action btn-action--white" onClick={handleDownloadSkipped}>
                  ↓ Download skipped list ({skippedRows.length})
                </button>
              )}
            </div>
          )}

          {!summary.empty && (
            <>
              <div className="im-summary-counts" style={{ flexWrap: 'wrap' }}>
                <div className="im-summary-count-item">
                  <span className="im-summary-count-label">CDSL rows</span>
                  <span className="im-summary-count-value">{summary.cdsl.toLocaleString()}</span>
                </div>
                <div className="im-summary-count-item">
                  <span className="im-summary-count-label">NSDL rows</span>
                  <span className="im-summary-count-value">{summary.nsdl.toLocaleString()}</span>
                </div>
                <div className="im-summary-count-item">
                  <span className="im-summary-count-label">Physical rows</span>
                  <span className="im-summary-count-value">{summary.physical.toLocaleString()}</span>
                </div>
                <div className="im-summary-count-item">
                  <span className="im-summary-count-label">Total rows</span>
                  <span className="im-summary-count-value">{summary.total.toLocaleString()}</span>
                </div>
                <div className="im-summary-count-item">
                  <span className="im-summary-count-label">Total shares</span>
                  <span className="im-summary-count-value">
                    {summary.totalShares.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="im-summary-count-item" style={{ borderRight: 'none' }}>
                  <span className="im-summary-count-label">Skipped</span>
                  <span className="im-summary-count-value">{summary.skippedCount.toLocaleString()}</span>
                </div>
                {summary.fallbackCount > 0 && (
                  <div
                    className="im-summary-count-item"
                    style={{ borderRight: 'none', flex: '1 0 100%', borderTop: '1px solid #e8ecf0', marginTop: 4, paddingTop: 12 }}
                  >
                    <span className="im-summary-count-label">Fallback sub-status used</span>
                    <span className="im-summary-count-value" style={{ fontSize: 18 }}>
                      {summary.fallbackCount.toLocaleString()}
                    </span>
                  </div>
                )}
                {summary.unclassifiedCount > 0 && (
                  <div
                    className="im-summary-count-item"
                    style={{ borderRight: 'none', flex: '1 0 100%', borderTop: '1px solid #e8ecf0', marginTop: 4, paddingTop: 12 }}
                  >
                    <span className="im-summary-count-label">Client type not classified (set PN)</span>
                    <span className="im-summary-count-value" style={{ fontSize: 18 }}>
                      {summary.unclassifiedCount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              {skippedRows.length > 0 && (
                <div style={{ padding: '10px 16px 14px' }}>
                  <button className="btn-action btn-action--white" onClick={handleDownloadSkipped}>
                    ↓ Download skipped list ({skippedRows.length})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}

export default EVoting;
