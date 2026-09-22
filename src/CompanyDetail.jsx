import { useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import './IsinMaster.css';
import './CompanyDetail.css';

function getPageRange(currentPage, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages       = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd   = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2)            pages.push('...');
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
  if (windowEnd < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

function PaginationBar({ page, perPage, totalCount, totalPages, goto, setPage, setGoto, onGoto }) {
  const first = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const last  = Math.min(page * perPage, totalCount);
  return (
    <div className="im-pagination">
      <span className="pagination-info">
        {totalCount === 0
          ? 'Showing 0 entries'
          : `Showing ${first} to ${last} of ${totalCount} entries`}
      </span>
      <div className="pagination-controls">
        {getPageRange(page, totalPages).map((item, idx) =>
          item === '...'
            ? <span key={`ellipsis-${idx}`} className="page-ellipsis">…</span>
            : (
              <button
                key={item}
                className={`page-btn${item === page ? ' page-btn--active' : ''}`}
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            )
        )}
        <span className="goto-label">Go to:</span>
        <input
          className="goto-input"
          type="number"
          min={1}
          max={totalPages || 1}
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGoto()}
        />
        <button className="page-btn" onClick={onGoto}>→</button>
      </div>
    </div>
  );
}

const SHAREHOLDER_COLS = [
  'Folio No.',
  'Shareholder Name',
  'Father / Husband Name',
  'Address',
  'City',
  'State',
  'Pin Code',
  'PAN',
  'Total Shares',
  'Date of Registration',
];

const SHAREHOLDING_COLS = [
  'Folio No.',
  'Holder Name',
  'Certificate No.',
  'Distinctive No. From',
  'Distinctive No. To',
  'Shares',
  'Lock-in Shares',
  'Date of Transfer',
  'Date of BenPos',
];

function BenposSection({ title, cols, page, setPage, perPage, setPerPage, goto, setGoto, onGoto, search, setSearch }) {
  function handlePerPageChange(e) {
    setPerPage(Number(e.target.value));
    setPage(1);
  }

  return (
    <div className="im-card">
      <div className="im-card-header">
        <span>{title}</span>
        <label className="entries-label">
          Entries per page
          <select className="entries-select" value={perPage} onChange={handlePerPageChange}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="cd-search-row">
        <input
          className="im-input cd-search-input"
          placeholder="Search by Folio No..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="im-table-wrapper">
        <table className="im-table">
          <thead>
            <tr>{cols.map((col) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <td className="im-empty-state" colSpan={cols.length}>No data available.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        perPage={perPage}
        totalCount={0}
        totalPages={0}
        goto={goto}
        setPage={setPage}
        setGoto={setGoto}
        onGoto={onGoto}
      />
    </div>
  );
}

function CompanyDetail() {
  const { issuerCode } = useParams();
  const location       = useLocation();
  const row            = location.state?.row ?? {};
  const companyName    = row.issuerCode ?? issuerCode;

  const [s1Page,    setS1Page]    = useState(1);
  const [s1PerPage, setS1PerPage] = useState(25);
  const [s1Goto,    setS1Goto]    = useState('');
  const [s1Search,  setS1Search]  = useState('');

  const [s2Page,    setS2Page]    = useState(1);
  const [s2PerPage, setS2PerPage] = useState(25);
  const [s2Goto,    setS2Goto]    = useState('');
  const [s2Search,  setS2Search]  = useState('');

  return (
    <div className="isin-master">

      {/* ── Top row: page heading + count badges + company name ── */}
      <div className="cd-top-row">
        <h1 className="page-heading">Physical</h1>
        <div className="cd-top-right">
          <span className="cd-badge cd-badge--physical">Physical: 0</span>
          <span className="cd-badge cd-badge--nsdl">NSDL: 0</span>
          <span className="cd-badge cd-badge--cdsl">CDSL: 0</span>
          <span className="cd-company-name">
            <span className="cd-company-icon">🏢</span>
            {companyName}
          </span>
        </div>
      </div>

      {/* ── Section 1: Benpos Physical Shareholder ── */}
      <BenposSection
        title="Benpos Physical Shareholder"
        cols={SHAREHOLDER_COLS}
        page={s1Page}    setPage={setS1Page}
        perPage={s1PerPage} setPerPage={setS1PerPage}
        goto={s1Goto}    setGoto={setS1Goto}
        onGoto={() => setS1Goto('')}
        search={s1Search} setSearch={setS1Search}
      />

      {/* ── Section 2: Benpos Physical Shareholding ── */}
      <BenposSection
        title="Benpos Physical Shareholding"
        cols={SHAREHOLDING_COLS}
        page={s2Page}    setPage={setS2Page}
        perPage={s2PerPage} setPerPage={setS2PerPage}
        goto={s2Goto}    setGoto={setS2Goto}
        onGoto={() => setS2Goto('')}
        search={s2Search} setSearch={setS2Search}
      />

    </div>
  );
}

export default CompanyDetail;
