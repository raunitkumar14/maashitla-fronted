import api from './api/axios';

export const CHUNK_SIZE = 5000;
const POLL_INTERVAL_MS = 1000;

// ── Date converters ───────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// DD-MMM-YYYY (e.g. "05-MAR-1990") → ISO 8601 UTC string, or null if blank/invalid
function parseDMYDate(raw) {
  if (!raw?.trim()) return null;
  const parts = raw.trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mon, yyyy] = parts;
  const monthIdx = MONTH_MAP[mon?.toUpperCase()];
  if (monthIdx === undefined) return null;
  const day  = parseInt(dd,   10);
  const year = parseInt(yyyy, 10);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  return new Date(Date.UTC(year, monthIdx, day)).toISOString();
}

// DDMMYYYY (e.g. "28082026") → ISO 8601 UTC string, or null if blank/invalid
function parseBenposDate(raw) {
  if (!raw?.trim() || raw.trim().length !== 8) return null;
  const s    = raw.trim();
  const dd   = parseInt(s.slice(0, 2), 10);
  const mm   = parseInt(s.slice(2, 4), 10) - 1; // 0-indexed month
  const yyyy = parseInt(s.slice(4, 8), 10);
  if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
  return new Date(Date.UTC(yyyy, mm, dd)).toISOString();
}

// ── Field type sets ───────────────────────────────────────────────────────────

const DATE_FIELDS_DMY = new Set(['birthDate', 'acOpeningDate', 'rbiApprovalDate']);

const NUMERIC_FIELDS = new Set([
  'totalHolding', 'totalLockIn', 'pledgeBalance', 'safeKeepBalance',
  'earmarkBalance', 'pendingRematConfirmation', 'freeBalance',
  'pendingDematVerification', 'pendingDematConfirmation', 'pledgeSetupBalance',
  'rematAgainstLockInBalance', 'nomineePercentageOfShares',
  'secondNomineePercentageOfShares', 'thirdNomineePercentageOfShares',
  'nduBalance', 'otherEncumberedBalance',
]);

// ── Record converter ──────────────────────────────────────────────────────────

function convertRecord(raw) {
  const record = {};
  for (const [key, value] of Object.entries(raw)) {
    if (DATE_FIELDS_DMY.has(key)) {
      const iso = parseDMYDate(value);
      if (iso !== null) record[key] = iso;
      // blank/unparseable → omit key entirely
    } else if (key === 'dateOfBenpos') {
      const iso = parseBenposDate(value);
      if (iso !== null) record[key] = iso;
    } else if (NUMERIC_FIELDS.has(key)) {
      record[key] = Number(value) || 0;
    } else {
      record[key] = value ?? '';
    }
  }
  return record;
}

// ── Polling ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilDone(jobId, batchNum, totalBatches, batchSize, recordsBefore, totalRecords, onProgress) {
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes  = await api.get(`/admin/v1/benpos-cdsl/bulk/${jobId}`);
    const jobState = pollRes.data?.data?.job ?? {};

    onProgress({
      phase:                'polling',
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

// ── Main export ───────────────────────────────────────────────────────────────

/*
 * uploadCdslBenpos — converts, chunks, posts and polls the full parsed dataset.
 *
 * onProgress is called after every state change:
 *   { phase: 'posting', batchNum, totalBatches, recordsBefore, totalRecords }
 *   { phase: 'polling', batchNum, totalBatches, currentBatchProcessed,
 *                        currentBatchTotal, recordsBefore, totalRecords }
 *
 * Returns { totalSucceeded, totalFailed, errors[] }.
 * Throws on network errors so the caller can catch and display them.
 */
export async function uploadCdslBenpos(records, onProgress) {
  const chunks = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    chunks.push(records.slice(i, i + CHUNK_SIZE));
  }

  let totalSucceeded = 0;
  let totalFailed    = 0;
  const allErrors    = [];

  for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
    const chunk        = chunks[batchIdx];
    const recordsBefore = batchIdx * CHUNK_SIZE;
    const batchNum     = batchIdx + 1;

    onProgress({
      phase: 'posting',
      batchNum,
      totalBatches:  chunks.length,
      recordsBefore,
      totalRecords:  records.length,
    });

    const payload = chunk.map(convertRecord);
    const res     = await api.post('/admin/v1/benpos-cdsl/bulk', payload);

    if (res.status === 202) {
      const job      = res.data?.data?.job ?? {};
      const jobState = await pollUntilDone(
        job.id,
        batchNum,
        chunks.length,
        chunk.length,
        recordsBefore,
        records.length,
        onProgress,
      );
      totalSucceeded += jobState.succeededRows ?? 0;
      totalFailed    += jobState.failedRows    ?? 0;
      if (Array.isArray(jobState.errors)) allErrors.push(...jobState.errors);
    } else {
      // Synchronous 200 success (chunk ≤100 rows, unlikely at CHUNK_SIZE=5000)
      totalSucceeded += chunk.length;
    }
  }

  return { totalSucceeded, totalFailed, errors: allErrors };
}
