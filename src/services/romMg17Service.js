import api from '../api/axios';

const BASE = '/admin/v1/rom-mg17';

// Normalises the /options response regardless of envelope shape or isin field names.
// Actual backend shape: { success:true, data:{ dates:[...], isins:[{isin, issuerName}] } }
// Also handles: flat { dates, isins }, isins as plain strings, issuer_name / name aliases.
export function parseOptions(res) {
  const d = res.data?.data ?? res.data ?? {};
  const dates = Array.isArray(d.dates) ? d.dates : [];
  const rawIsins = Array.isArray(d.isins) ? d.isins : [];
  const isins = rawIsins.map(item => {
    if (typeof item === 'string') return { isin: item, issuerName: '' };
    return {
      isin:       item.isin       ?? String(item),
      issuerName: item.issuerName ?? item.issuer_name ?? item.name ?? '',
    };
  });
  return { dates, isins };
}

export async function getOptions({ isin, search, limit } = {}) {
  const params = {};
  if (isin)              params.isin   = isin;
  if (search !== undefined) params.search = search;
  if (limit)             params.limit  = limit;
  const res = await api.get(`${BASE}/options`, { params });
  return parseOptions(res);
}

export async function exportFile({ date, isin } = {}) {
  const params = { date };
  if (isin) params.isin = isin;
  return api.get(`${BASE}/export`, { params, responseType: 'blob' });
}
