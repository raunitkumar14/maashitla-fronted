import api from '../api/axios';

const BASE = '/admin/v1/reg133';

export async function getTemplate() {
  return api.get(`${BASE}/template`, { responseType: 'blob' });
}

export async function importFile(file, issuerCode) {
  const fd = new FormData();
  fd.append('file', file);
  if (issuerCode) fd.append('issuerCode', issuerCode);
  const res = await api.post(`${BASE}/import`, fd);
  return res.data?.data ?? res.data;
}

export async function list(params) {
  const res = await api.get(BASE, { params });
  const d = res.data?.data ?? res.data;
  return {
    rows:       d?.items      ?? [],
    totalCount: d?.total      ?? d?.totalCount ?? 0,
    totalPages: d?.totalPages ?? 1,
  };
}

export async function getCompanies() {
  const res = await api.get(`${BASE}/companies`);
  return res.data?.data ?? res.data ?? [];
}

export async function getQuarterDates(issuerCode) {
  const params = issuerCode ? { issuerCode } : {};
  const res = await api.get(`${BASE}/quarter-dates`, { params });
  return res.data?.data?.dates ?? res.data?.dates ?? [];
}

export async function exportReport(issuerCode, quarterEndDate) {
  return api.get(`${BASE}/export`, {
    params: { issuerCode, quarterEndDate },
    responseType: 'blob',
  });
}
