import JSZip from 'jszip';
import { NSDL_COLUMNS } from './nsdlColumns';

function parseDate(raw) {
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function parseDecimal(raw) {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return Number(raw) / 1000;
}

function parseLine(line) {
  const record = {};
  for (const col of NSDL_COLUMNS) {
    const raw = line.slice(col.start, col.end).trim();
    if (col.type === 'date')    { record[col.field] = parseDate(raw);    continue; }
    if (col.type === 'decimal') { record[col.field] = parseDecimal(raw); continue; }
    if (col.type === 'flag')    { record[col.field] = raw === '1';       continue; }
    record[col.field] = raw;
  }
  return record;
}

export async function parseNsdlZip(zipFile) {
  const buffer = await zipFile.arrayBuffer();
  const zip    = await JSZip.loadAsync(buffer);

  const txtFiles = Object.values(zip.files)
    .filter(f => !f.dir && f.name.endsWith('.txt'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allRecords = [];

  for (const file of txtFiles) {
    const text  = await file.async('string');
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const dataLines = lines.slice(1); // drop header row
    for (const line of dataLines) {
      allRecords.push(parseLine(line));
    }
  }

  return allRecords;
}
