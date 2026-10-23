import { useState, useEffect } from 'react';
import './IsinMaster.css';
import './BenPos.css';
import './ShareholdingPattern.css';
import api from './api/axios';
import { exportShp } from './shpExport';

function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso;
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function ShareholdingPattern() {
  const [companyQuery,        setCompanyQuery]        = useState('');
  const [selectedCompany,     setSelectedCompany]     = useState(null);
  const [companySuggestions,  setCompanySuggestions]  = useState([]);
  const [companyLoading,      setCompanyLoading]      = useState(false);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [companyError,        setCompanyError]        = useState('');

  const [isins,        setIsins]        = useState([]);
  const [selectedIsin, setSelectedIsin] = useState('');
  const [isinLoading,  setIsinLoading]  = useState(false);
  const [isinError,    setIsinError]    = useState('');

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate,   setSelectedDate]   = useState('');
  const [datesLoading,   setDatesLoading]   = useState(false);
  const [datesError,     setDatesError]     = useState('');

  const [infoMessage,    setInfoMessage]    = useState('');
  const [errorMessage,   setErrorMessage]   = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [downloading,    setDownloading]    = useState(false);

  // ── Company autocomplete ─────────────────────────────────────────────────────

  useEffect(() => {
    const q = companyQuery.trim();
    if (q.length < 2) {
      setCompanySuggestions([]);
      setCompanyLoading(false);
      return;
    }
    setCompanyLoading(true);
    setCompanyError('');
    const timer = setTimeout(async () => {
      try {
        const [byName, byCode] = await Promise.allSettled([
          api.get('/admin/v1/issuers', { params: { issuerName: q, pageSize: 10 } }),
          api.get('/admin/v1/issuers', { params: { issuerCode: q, pageSize: 10 } }),
        ]);
        const seen = new Map();
        for (const res of [byName, byCode]) {
          if (res.status === 'fulfilled') {
            for (const item of (res.value.data?.data?.items ?? [])) {
              if (!seen.has(item.issuerCode)) seen.set(item.issuerCode, item);
            }
          }
        }
        setCompanySuggestions([...seen.values()].slice(0, 10));
        setShowCompanyDropdown(true);
      } catch {
        setCompanySuggestions([]);
        setCompanyError('Could not load companies. Please try again.');
      } finally {
        setCompanyLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [companyQuery]);

  // ── ISIN list — fetch all ISINs for the selected company ─────────────────────

  useEffect(() => {
    if (!selectedCompany) {
      setIsins([]);
      setSelectedIsin('');
      setIsinError('');
      return;
    }
    let cancelled = false;
    setIsinLoading(true);
    setIsinError('');
    setSelectedIsin('');
    setIsins([]);
    (async () => {
      try {
        const PAGE_SIZE = 500;
        let page = 1;
        let allIsins = [];
        while (true) {
          const res = await api.get('/admin/v1/isins', {
            params: { issuerCode: selectedCompany.issuerCode, pageSize: PAGE_SIZE, page },
          });
          if (cancelled) return;
          const data = res.data?.data;
          const items = data?.items ?? [];
          allIsins = allIsins.concat(items);
          const totalCount = data?.totalCount ?? items.length;
          if (allIsins.length >= totalCount || items.length < PAGE_SIZE) break;
          page++;
        }
        setIsins(allIsins);
      } catch {
        if (!cancelled) setIsinError('Could not load ISINs for this company.');
      } finally {
        if (!cancelled) setIsinLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCompany]);

  // ── BenPos dates — same call + format as BenPos page ─────────────────────────

  useEffect(() => {
    if (!selectedIsin) {
      setAvailableDates([]);
      setSelectedDate('');
      setDatesError('');
      return;
    }
    setDatesLoading(true);
    setDatesError('');
    setSelectedDate('');
    setAvailableDates([]);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/admin/v1/benpos-dates', { params: { isin: selectedIsin } });
        const dates = res.data?.data?.dates ?? res.data?.dates ?? [];
        setAvailableDates(dates);
        if (dates.length === 1) setSelectedDate(dates[0]);
      } catch {
        setDatesError('Could not load BenPos dates for this ISIN.');
      } finally {
        setDatesLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedIsin]);

  async function handleDownload() {
    setInfoMessage('');
    setErrorMessage('');
    setWarningMessage('');
    setDownloading(true);
    try {
      // Find the selected ISIN object to get totalHoldings and faceValue
      const isinObj = isins.find(i => i.isin === selectedIsin);
      const totalHoldings = isinObj?.totalHoldings ?? null;
      const faceValue     = isinObj?.faceValue ?? null;

      const result = await exportShp(selectedIsin, selectedDate, totalHoldings, faceValue);

      const msgs = [];
      if (result.noPromoters) msgs.push('No promoter holdings found.');
      if (result.skippedPans.length > 0)
        msgs.push(`${result.skippedPans.length} promoter holding(s) skipped: no SHP Promoter Code (PAN: ${result.skippedPans.slice(0, 5).join(', ')}${result.skippedPans.length > 5 ? '…' : ''}).`);
      if (result.noPublic) msgs.push('No public holdings found.');
      if (result.skippedPublicPans.length > 0)
        msgs.push(`${result.skippedPublicPans.length} public holding(s) skipped: no SHP Public Code (PAN: ${result.skippedPublicPans.slice(0, 20).join(', ')}${result.skippedPublicPans.length > 20 ? '…' : ''}).`);
      if (result.skippedUnknownCPans.length > 0)
        msgs.push(`${result.skippedUnknownCPans.length} holding(s) skipped: unknown SHP Public Code (PAN: ${result.skippedUnknownCPans.slice(0, 20).join(', ')}${result.skippedUnknownCPans.length > 20 ? '…' : ''}).`);
      if (result.faceValueMissing)
        msgs.push('Face value not available: all resident individuals shown under (g).');
      if (result.totalSharesSource === 'benpos')
        msgs.push('Total shares taken from BenPos total (ISIN Total Holdings is empty).');

      const warnings = [result.promoterWarning, result.categoryWarning].filter(Boolean);
      if (warnings.length) setWarningMessage(warnings.join(' '));

      setInfoMessage(msgs.length ? msgs.join(' ') : 'Shareholding Pattern downloaded successfully.');
    } catch (err) {
      setErrorMessage('Export failed: ' + (err?.message || String(err)));
    } finally {
      setDownloading(false);
    }
  }

  const canDownload = !!selectedCompany && !!selectedIsin && !!selectedDate && !downloading;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="isin-master">
      <h1 className="page-heading">Shareholding Pattern</h1>

      <div className="im-card">
        <div className="im-card-header">
          <span>Shareholding Pattern Report</span>
        </div>

        <div className="benpos-filter-body">
          <div className="benpos-filter-row">

            {/* ── Company ── */}
            <div className="benpos-field benpos-issuer-field">
              <label className="benpos-label">Company</label>
              {selectedCompany ? (
                <div className="benpos-issuer-selected">
                  <span title={`${selectedCompany.issuerName || ''} (${selectedCompany.issuerCode})`}>
                    {selectedCompany.issuerName || selectedCompany.issuerCode}
                  </span>
                  <button
                    type="button"
                    className="benpos-issuer-clear"
                    onClick={() => {
                      setSelectedCompany(null);
                      setCompanyQuery('');
                      setInfoMessage('');
                    }}
                  >×</button>
                </div>
              ) : (
                <div className="benpos-issuer-wrap">
                  <input
                    className="benpos-issuer-input"
                    type="text"
                    placeholder="Company"
                    value={companyQuery}
                    onChange={e => { setCompanyQuery(e.target.value); setShowCompanyDropdown(true); }}
                    onFocus={() => companySuggestions.length > 0 && setShowCompanyDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCompanyDropdown(false), 150)}
                  />
                  {companyLoading && <span className="benpos-issuer-spinner">…</span>}
                  {showCompanyDropdown && companySuggestions.length > 0 && (
                    <ul className="benpos-issuer-dropdown">
                      {companySuggestions.map(item => (
                        <li
                          key={item.issuerCode}
                          className="benpos-issuer-option"
                          onMouseDown={e => {
                            e.preventDefault();
                            setSelectedCompany(item);
                            setCompanyQuery('');
                            setCompanySuggestions([]);
                            setShowCompanyDropdown(false);
                            setInfoMessage('');
                          }}
                        >
                          <span className="benpos-issuer-option-name">{item.issuerName || '—'}</span>
                          <span className="benpos-issuer-option-code">{item.issuerCode}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* ── ISIN ── */}
            <div className="benpos-field benpos-issuer-field">
              <label className="benpos-label">ISIN</label>
              {isinLoading ? (
                <select className="benpos-select" disabled>
                  <option>Loading…</option>
                </select>
              ) : !selectedCompany ? (
                <select className="benpos-select" disabled>
                  <option>Select a company first</option>
                </select>
              ) : isinError ? (
                <>
                  <select className="benpos-select" disabled>
                    <option>Error loading ISINs</option>
                  </select>
                  <span className="benpos-date-note benpos-date-note--error">{isinError}</span>
                </>
              ) : (
                <select
                  className="benpos-select"
                  value={selectedIsin}
                  onChange={e => { setSelectedIsin(e.target.value); setInfoMessage(''); }}
                >
                  <option value="">— Select ISIN —</option>
                  {isins.map(isin => (
                    <option key={isin.isin} value={isin.isin}>
                      {isin.isin}{isin.isinDescription ? ` — ${isin.isinDescription}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* ── BenPos Date ── */}
            <div className="benpos-field benpos-field--date">
              <label className="benpos-label">BenPos Date</label>
              {datesLoading ? (
                <select className="benpos-select" disabled>
                  <option>Loading…</option>
                </select>
              ) : !selectedIsin ? (
                <select className="benpos-select" disabled>
                  <option>Select an ISIN first</option>
                </select>
              ) : availableDates.length === 0 ? (
                <>
                  <select className="benpos-select" disabled>
                    <option>No data available</option>
                  </select>
                  <span className="benpos-date-note">No BenPos data available for this ISIN</span>
                </>
              ) : (
                <select
                  className="benpos-select"
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setInfoMessage(''); }}
                >
                  <option value="">— Select date —</option>
                  {availableDates.map(d => (
                    <option key={d} value={d}>{fmtDate(d)}</option>
                  ))}
                </select>
              )}
              {datesError && (
                <span className="benpos-date-note benpos-date-note--error">{datesError}</span>
              )}
            </div>

            {/* ── Download button ── */}
            <button
              className="btn-action btn-action--pink benpos-download-btn"
              onClick={handleDownload}
              disabled={!canDownload}
            >
              {downloading ? '…' : '↓ DOWNLOAD'}
            </button>

          </div>

          {companyError && (
            <div className="im-banner im-banner--error">⚠ {companyError}</div>
          )}
          {errorMessage && (
            <div className="im-banner im-banner--error">⚠ {errorMessage}</div>
          )}
          {warningMessage && (
            <div className="im-banner im-banner--info">⚠ {warningMessage}</div>
          )}
          {infoMessage && (
            <div className="im-banner im-banner--info">ℹ {infoMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareholdingPattern;
