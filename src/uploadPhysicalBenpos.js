import api from './api/axios';

const CHUNK_SIZE    = 5000;
const POLL_INTERVAL = 1000; // ms

// ── Date parser ───────────────────────────────────────────────────────────────
// Tries the most common RTA date formats; returns ISO 8601 UTC string or null.

const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseDate(raw) {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD/MM/YYYY or DD-MM-YYYY (numeric month, 1–2 digit day/month)
  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD-MMM-YYYY  e.g. "01-JAN-2024"
  const dmmmY = s.match(/^(\d{1,2})[/\-]([A-Za-z]{3})[/\-](\d{4})$/);
  if (dmmmY) {
    const mon = MONTH_MAP[dmmmY[2].toUpperCase()];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(+dmmmY[3], mon, +dmmmY[1]));
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  // DD-MMM-YY  e.g. "01-JAN-24" → treat as 2000 + yy
  const dmmmy = s.match(/^(\d{1,2})[/\-]([A-Za-z]{3})[/\-](\d{2})$/);
  if (dmmmy) {
    const mon = MONTH_MAP[dmmmy[2].toUpperCase()];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(2000 + +dmmmy[3], mon, +dmmmy[1]));
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
  }

  // YYYYMMDD compact
  if (/^\d{8}$/.test(s)) {
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

// ── Field type sets ───────────────────────────────────────────────────────────

const SHAREHOLDER_DATE_FIELDS = new Set([
  'dateOfIncorporation', 'holder1BirthDate', 'nominationBirthDate',
]);

const SHAREHOLDING_DATE_FIELDS = new Set([
  'dateOfIssuance', 'lockInReleaseDate',
]);

// ── Record converters ─────────────────────────────────────────────────────────

function convertShareholder(raw) {
  const record = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SHAREHOLDER_DATE_FIELDS.has(key)) {
      const iso = parseDate(value);
      if (iso !== null) record[key] = iso; // omit key if blank / unparseable
    } else if (key === 'shareQty') {
      record[key] = Number(value) || 0;
    } else {
      record[key] = value ?? '';
    }
  }
  return record;
}

function convertShareholding(raw) {
  const record = {};
  for (const [key, value] of Object.entries(raw)) {
    if (SHAREHOLDING_DATE_FIELDS.has(key)) {
      const iso = parseDate(value);
      if (iso !== null) record[key] = iso; // omit key if blank / unparseable
    } else if (key === 'quantity') {
      record[key] = Number(value) || 0;
    } else if (key === 'distinctiveNumberFrom' || key === 'distinctiveNumberTo') {
      record[key] = String(value ?? ''); // always a string, even when source looks numeric
    } else {
      record[key] = value ?? '';
    }
  }
  return record;
}

// ── Polling ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilDone(
  pollUrl, batchNum, totalBatches, batchSize, recordsBefore, totalRecords,
  uploadPhase, uploadPhaseLabel, onProgress,
) {
  while (true) {
    await sleep(POLL_INTERVAL);
    const pollRes  = await api.get(pollUrl);
    const jobState = pollRes.data?.data?.job ?? {};

    onProgress({
      phase:                 'polling',
      uploadPhase,
      uploadPhaseLabel,
      batchNum,
      totalBatches,
      currentBatchProcessed: jobState.processedRows ?? 0,
      currentBatchTotal:     jobState.totalRows     ?? batchSize,
      recordsBefore,
      totalRecords,
    });

    if (jobState.status === 'COMPLETED' || jobState.status === 'FAILED') {
      return jobState;
    }
  }
}

// ── Chunked upload for a single phase ─────────────────────────────────────────

async function uploadChunks(records, baseUrl, uploadPhase, uploadPhaseLabel, converter, onProgress) {
  if (records.length === 0) return { totalSucceeded: 0, totalFailed: 0, errors: [] };

  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  let totalSucceeded = 0;
  let totalFailed    = 0;
  const allErrors    = [];

  for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
    const chunk         = chunks[batchIdx];
    const recordsBefore = batchIdx * CHUNK_SIZE;
    const batchNum      = batchIdx + 1;

    onProgress({
      phase: 'posting',
      uploadPhase,
      uploadPhaseLabel,
      batchNum,
      totalBatches: chunks.length,
      recordsBefore,
      totalRecords: records.length,
    });

    const payload = chunk.map(converter);
    const res     = await api.post(baseUrl, payload);

    if (res.status === 202) {
      const job      = res.data?.data?.job ?? {};
      const jobState = await pollUntilDone(
        `${baseUrl}/${job.id}`,
        batchNum,
        chunks.length,
        chunk.length,
        recordsBefore,
        records.length,
        uploadPhase,
        uploadPhaseLabel,
        onProgress,
      );
      totalSucceeded += jobState.succeededRows ?? 0;
      totalFailed    += jobState.failedRows    ?? 0;
      if (Array.isArray(jobState.errors)) allErrors.push(...jobState.errors);
    } else {
      // Synchronous 200 (rare at CHUNK_SIZE = 5000, but handle it)
      totalSucceeded += chunk.length;
    }
  }

  return { totalSucceeded, totalFailed, errors: allErrors };
}

// ── Main export ───────────────────────────────────────────────────────────────

/*
 * uploadPhysicalBenpos — two-phase bulk upload.
 *
 * Phase 1 (shareholders) must fully complete before Phase 2 (shareholdings)
 * starts — the server enforces a foreign-key constraint on folioIsinIncorpDate.
 *
 * onProgress shape:
 *   { phase, uploadPhase, uploadPhaseLabel, batchNum, totalBatches,
 *     recordsBefore, totalRecords,
 *     currentBatchProcessed?, currentBatchTotal? }   ← polling-only fields
 *
 * Returns:
 *   { shareholders: { totalSucceeded, totalFailed, errors },
 *     shareholdings: { totalSucceeded, totalFailed, errors } }
 */
export async function uploadPhysicalBenpos(shareholders, shareholdings, onProgress) {
  const shareholderResult = await uploadChunks(
    shareholders,
    '/admin/v1/benpos-physical-shareholder/bulk',
    1,
    'Shareholders',
    convertShareholder,
    onProgress,
  );

  // ⚠ Phase 2 starts only after all Phase 1 chunks/polls are resolved
  const shareholdingResult = await uploadChunks(
    shareholdings,
    '/admin/v1/benpos-physical-shareholding/bulk',
    2,
    'Shareholdings',
    convertShareholding,
    onProgress,
  );

  return {
    shareholders:  shareholderResult,
    shareholdings: shareholdingResult,
  };
}
