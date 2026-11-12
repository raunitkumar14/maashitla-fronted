import api from '../api/axios';

export function normalizeIssuerOption(raw) {
  return {
    issuerCode: raw.issuerCode ?? raw.issuer_code ?? '',
    issuerName: raw.issuerName ?? raw.issuer_name ?? '',
    address:    raw.address    ?? '',
    city:       raw.city       ?? '',
    state:      raw.state      ?? '',
    pincode:    raw.pincode    ?? '',
    phone:      raw.phone      ?? '',
    email:      raw.email      ?? '',
  };
}

export async function getIssuerOptions(search = '') {
  const res = await api.get('/admin/v1/issuers/options', { params: { search } });
  const raw = res.data?.data ?? res.data;
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.rows ?? []);
  return arr.map(normalizeIssuerOption);
}
