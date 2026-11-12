import { useState, useEffect, useRef } from 'react';
import '../IsinMaster.css';
import './Pas6.css';
import '../DaakEntry.css';
import { searchCompanies, getRecoDates, download } from '../services/pas6Service';
import { triggerDownload } from '../services/daakService';

function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

async function readBlobError(blob) {
  try {
    const text = await blob.text();
    return JSON.parse(text)?.error?.message ?? null;
  } catch {
    return null;
  }
}

function Pas6() {
  const [selectedIsin,  setSelectedIsin]  = useState(null); // null = All, {isin,companyName} = specific
  const [isAllMode,     setIsAllMode]     = useState(true);
  const [isinQuery,     setIsinQuery]     = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [isinLoading,  setIsinLoading]  = useState(false);
  const [searchError,  setSearchError]  = useState('');
  const [showDrop,     setShowDrop]     = useState(false);
  const [recoDates,    setRecoDates]    = useState([]);
  const [datesLoading, setDatesLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [downloading,  setDownloading]  = useState(false);
  const [error,        setError]        = useState('');

  const wrapRef = useRef(null);
  const genRef  = useRef(0);

  useEffect(() => {
    if (!isAllMode && selectedIsin === null) return;
    setSelectedDate('');
    setRecoDates([]);
    setError('');
    setDatesLoading(true);
    getRecoDates(selectedIsin?.isin)
      .then(dates => { setRecoDates(dates); setDatesLoading(false); })
      .catch(() => setDatesLoading(false));
  }, [selectedIsin, isAllMode]);

  // Debounced search — fires when user types (not on focus)
  useEffect(() => {
    if (selectedIsin) return;
    if (!isinQuery.trim()) return;
    const gen = ++genRef.current;
    setIsinLoading(true);
    setSuggestions([]);
    setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const items = await searchCompanies(isinQuery.trim(), 50);
        if (gen !== genRef.current) return;
        setSuggestions(items);
        setSearchError('');
        setShowDrop(true);
      } catch (err) {
        if (gen !== genRef.current) return;
        setSuggestions([]);
        setSearchError(err?.response?.data?.error?.message ?? err?.message ?? 'Could not load ISINs');
      } finally {
        if (gen === genRef.current) setIsinLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isinQuery, selectedIsin]);

  async function loadInitialSuggestions() {
    const gen = ++genRef.current;
    setIsinLoading(true);
    setSuggestions([]);
    try {
      const items = await searchCompanies('', 50);
      if (gen !== genRef.current) return;
      setSuggestions(items);
      setSearchError('');
    } catch (err) {
      if (gen !== genRef.current) return;
      setSearchError(err?.response?.data?.error?.message ?? err?.message ?? 'Could not load ISINs');
    } finally {
      if (gen === genRef.current) setIsinLoading(false);
    }
  }

  function handleAllSelect() {
    setSelectedIsin(null);
    setIsAllMode(true);
    setIsinQuery('');
    setSuggestions([]);
    setSearchError('');
    setShowDrop(false);
    setError('');
  }

  function handleIsinSelect(item) {
    setSelectedIsin(item);
    setIsAllMode(false);
    setIsinQuery('');
    setSuggestions([]);
    setSearchError('');
    setShowDrop(false);
    setError('');
  }

  function clearIsin() {
    setSelectedIsin(null);
    setIsAllMode(false);
    setIsinQuery('');
    setSuggestions([]);
    setSearchError('');
    setShowDrop(false);
  }

  async function handleDownload() {
    if (!selectedDate) return;
    setDownloading(true);
    setError('');
    try {
      const isin = selectedIsin?.isin ?? null;
      const res = await download(isin, selectedDate);
      const cd = res.headers?.['content-disposition'] ?? '';
      const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      const filename = match?.[1]?.replace(/['"]/g, '')
        || (isin ? `PAS6_${isin}_${selectedDate}.pdf` : `PAS6_ALL_${fmtDate(selectedDate)}.zip`);
      triggerDownload(res.data, filename);
    } catch (err) {
      let msg = err.message ?? 'Download failed.';
      if (err.response?.data instanceof Blob) {
        const fromBlob = await readBlobError(err.response.data);
        if (fromBlob) msg = fromBlob;
      } else if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      setError(msg);
    } finally {
      setDownloading(false);
    }
  }

  const showAllOption = !isinQuery.trim() || 'all'.startsWith(isinQuery.trim().toLowerCase());

  const displayValue = selectedIsin
    ? `${selectedIsin.isin}${selectedIsin.companyName ? ` - ${selectedIsin.companyName}` : ''}`
    : isinQuery;

  return (
    <div className="isin-master">
      <h1 className="page-heading">PAS-6</h1>

      <div className="im-card">
        <div className="im-card-header">PAS-6 Report</div>

        <div className="pas6-form-row">

          {/* ── ISIN suggestion box ── */}
          <div className="pas6-field" ref={wrapRef}>
            <label className="pas6-label">ISIN / Company</label>
            <div className="dk-company-wrap" style={{ minWidth: 220 }}>
              <input
                type="text"
                className="dk-company-input"
                value={displayValue}
                placeholder={isAllMode ? 'All' : 'Type ISIN or company…'}
                onChange={e => {
                  const val = e.target.value;
                  if (selectedIsin) clearIsin();
                  if (!val) {
                    setIsAllMode(true);
                    setSuggestions([]);
                    setSearchError('');
                    loadInitialSuggestions();
                  } else {
                    setIsAllMode(false);
                  }
                  setIsinQuery(val);
                }}
                onFocus={() => {
                  setShowDrop(true);
                  if (!selectedIsin && !isinQuery.trim() && !isinLoading) {
                    loadInitialSuggestions();
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.preventDefault(); setShowDrop(false); }
                }}
                onBlur={e => {
                  if (!wrapRef.current?.contains(e.relatedTarget)) setShowDrop(false);
                }}
              />
              {showDrop && !selectedIsin && (
                <ul className="dk-company-dropdown">
                  {showAllOption && (
                    <li
                      className="dk-company-opt"
                      onMouseDown={e => e.preventDefault()}
                      onClick={handleAllSelect}
                    >
                      <strong>All</strong>
                    </li>
                  )}
                  {isinLoading ? (
                    <li className="dk-company-opt dk-company-opt--hint">Loading…</li>
                  ) : searchError ? (
                    <li className="dk-company-opt dk-company-opt--hint">{searchError}</li>
                  ) : suggestions.length === 0 && isinQuery.trim() ? (
                    <li className="dk-company-opt dk-company-opt--hint">No matching ISIN</li>
                  ) : (
                    suggestions.map(item => (
                      <li
                        key={item.isin}
                        className="dk-company-opt"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleIsinSelect(item)}
                      >
                        <strong>{item.isin}</strong> — {item.companyName}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            {selectedIsin?.companyName && (
              <span className="pas6-comp-name">{selectedIsin.companyName}</span>
            )}
          </div>

          {/* ── Reco Date ── */}
          <div className="pas6-field">
            <label className="pas6-label">Reco Date</label>
            {datesLoading ? (
              <select className="pas6-select" disabled>
                <option>Loading…</option>
              </select>
            ) : recoDates.length === 0 ? (
              <select className="pas6-select" disabled>
                <option>No dates available</option>
              </select>
            ) : (
              <select
                className="pas6-select"
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setError(''); }}
              >
                <option value="">— Select date —</option>
                {recoDates.map(d => (
                  <option key={d} value={d}>{fmtDate(d)}</option>
                ))}
              </select>
            )}
          </div>

          <button
            className="btn-action btn-action--pink"
            onClick={handleDownload}
            disabled={!selectedDate || downloading}
          >
            {downloading ? 'Downloading…' : 'DOWNLOAD'}
          </button>
        </div>

        {downloading && isAllMode && (
          <div className="pas6-error-wrap">
            <div className="pas6-all-note">Generating all reports, this can take a while…</div>
          </div>
        )}
        {error && (
          <div className="pas6-error-wrap">
            <div className="im-banner im-banner--error">{error}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Pas6;
