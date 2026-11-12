import api from '../api/axios';

const BASE = '/admin/v1/share-capital-audit';

export async function searchCompanies(search = '', limit = 50) {
  const res = await api.get(`${BASE}/companies`, { params: { search, limit } });
  const raw = res.data?.data ?? res.data ?? [];
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.rows ?? []);
  return arr.map(item => ({
    isin:        item.isin        ?? item.ISIN        ?? '',
    companyName: item.companyName ?? item.company_name ?? item.name ?? '',
  }));
}

export async function getRecoDates(isin) {
  const params = isin ? { isin } : {};
  const res = await api.get(`${BASE}/reco-dates`, { params });
  return res.data?.data?.dates ?? res.data?.dates ?? [];
}

export async function download(isin, recoDate) {
  const params = isin ? { isin, recoDate } : { recoDate };
  return api.get(`${BASE}/download`, { params, responseType: 'blob' });
}
