import api from '../api/axios';

const BASE = '/admin/v1/pan-search';

export async function search(pan) {
  const res = await api.get(BASE, { params: { pan } });
  return res.data?.data ?? res.data;
}

export async function exportXlsx(pan) {
  return api.get(`${BASE}/export`, { params: { pan }, responseType: 'blob' });
}
