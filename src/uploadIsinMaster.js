import api from './api/axios';

export const CHUNK_SIZE    = 5000;
const POLL_INTERVAL_MS     = 1000;

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function pollUntilDone(jobId, batchNum, totalBatches, batchSize, recordsBefore, totalRecords, onProgress) {
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    const res      = await api.get(`/admin/v1/isins/bulk/${jobId}`);
    const jobState = res.data?.data?.job ?? {};

    onProgress({
      phase:                 'polling',
      batchNum,
      totalBatches,
      currentBatchProcessed: jobState.processedRows ?? 0,
      currentBatchTotal:     jobState.totalRows     ?? batchSize,
      recordsBefore,
      totalRecords,
    });

    if (jobState.status === 'COMPLETED' || jobState.status === 'FAILED') return jobState;
  }
}

/*
 * uploadIsinMaster — converts merged rows to API shape, chunks them into
 * CHUNK_SIZE batches, POSTs each batch and polls the job until complete.
 *
 * onProgress shape (same as the benpos upload utilities):
 *   { phase: 'posting', batchNum, totalBatches, recordsBefore, totalRecords }
 *   { phase: 'polling', batchNum, totalBatches, currentBatchProcessed,
 *                        currentBatchTotal, recordsBefore, totalRecords }
 *
 * Returns { totalSucceeded, totalFailed, errors[] }.
 * Throws on network / server errors so the caller can catch and display them.
 */
export async function uploadIsinMaster(mergedRows, onProgress) {
  const payload = mergedRows
    .map(row => ({
      isin:                   row.isin                   || '',
      isinDescription:        row.isinDescription        || '',
      securityType:           row.securityType           || '',
      isinStatus:             row.isinStatus             || null,
      faceValue:              row.faceValue              || null,
      paidupValue:            row.paidupValue            || null,
      issueDateCdsl:          row.issueDateCdsl          || null,
      convertDateCdsl:        row.convertDateCdsl        || null,
      issueDateNsdl:          row.issueDateNsdl          || null,
      maturityDate:           row.maturityDate           || null,
      convertDateNsdl:        row.convertDateNsdl        || null,
      isinStatusNsdl:         row.isinStatusNsdl         || null,
      isinActivationDateNsdl: row.isinActivationDateNsdl || null,
      source:                 row.source                 || '',
    }))
    .filter(r => r.isin);

  const chunks = [];
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    chunks.push(payload.slice(i, i + CHUNK_SIZE));
  }

  let totalSucceeded = 0;
  let totalFailed    = 0;
  const allErrors    = [];

  for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
    const chunk         = chunks[batchIdx];
    const recordsBefore = batchIdx * CHUNK_SIZE;
    const batchNum      = batchIdx + 1;

    onProgress({
      phase:        'posting',
      batchNum,
      totalBatches:  chunks.length,
      recordsBefore,
      totalRecords:  payload.length,
    });

    const res = await api.post('/admin/v1/isins/bulk', chunk);

    if (res.status === 202) {
      const job      = res.data?.data?.job ?? {};
      const jobState = await pollUntilDone(
        job.id, batchNum, chunks.length, chunk.length, recordsBefore, payload.length, onProgress,
      );
      totalSucceeded += jobState.succeededRows ?? 0;
      totalFailed    += jobState.failedRows    ?? 0;
      if (Array.isArray(jobState.errors)) allErrors.push(...jobState.errors);
    } else {
      totalSucceeded += chunk.length;
    }
  }

  return { totalSucceeded, totalFailed, errors: allErrors };
}
