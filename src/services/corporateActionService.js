import api from '../api/axios';
import { triggerDownload } from './daakService';

const BASE = '/admin/v1/corporate-action';

export async function getLockinReasons() {
  const res = await api.get(`${BASE}/lockin-reasons`);
  return res.data?.data ?? [];
}

export async function downloadTemplate() {
  return api.get(`${BASE}/cdsl/template`, { responseType: 'blob' });
}

export async function downloadDnrTemplate() {
  return api.get(`${BASE}/cdsl/dnr-template`, { responseType: 'blob' });
}

export async function downloadNsdlTemplate(mode) {
  return api.get(`${BASE}/nsdl/template`, { params: { mode }, responseType: 'blob' });
}

export async function downloadNsdlDnrTemplate(mode) {
  return api.get(`${BASE}/nsdl/dnr-template`, { params: { mode }, responseType: 'blob' });
}

export async function getNsdlCodes() {
  const res = await api.get(`${BASE}/nsdl/codes`);
  return res.data?.data ?? res.data;
}

export async function listCas(params) {
  const res = await api.get(BASE, { params });
  const d = res.data?.data ?? res.data;
  return {
    items: d?.items ?? [],
    pagination: d?.pagination ?? { total: 0, page: 1, pageSize: params?.pageSize ?? 20, totalPages: 1 },
  };
}

export async function createCa(formData) {
  const res = await api.post(`${BASE}/cdsl`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? res.data;
}

export async function createNsdlCa(formData) {
  const res = await api.post(`${BASE}/nsdl`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? res.data;
}

export async function getCa(id) {
  const res = await api.get(`${BASE}/${id}`);
  return res.data?.data ?? res.data;
}

export async function updateCa(id, formData) {
  const res = await api.put(`${BASE}/cdsl/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? res.data;
}

export async function updateNsdlCa(id, formData) {
  const res = await api.put(`${BASE}/nsdl/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? res.data;
}

export async function acceptCa(id) {
  const res = await api.post(`${BASE}/${id}/accept`);
  return res.data?.data ?? res.data;
}

export async function exportCa(id) {
  return api.get(`${BASE}/${id}/export`, { responseType: 'blob' });
}

export { triggerDownload };
