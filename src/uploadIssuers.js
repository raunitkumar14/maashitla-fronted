import api from './api/axios';

const ISSUER_CHUNK_SIZE = 500;
const POLL_INTERVAL_MS  = 1000;

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

function sanitiseEmail(issuerCode, field, value) {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.includes(',') || candidate.includes(';')) {
    candidate = candidate.split(/[,;]/)[0].trim();
  }
  if (EMAIL_RE.test(candidate)) return candidate;
  console.warn(`[uploadIssuers] issuerCode=${issuerCode} – nulling invalid ${field}: "${value}"`);
  return null;
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function pollUntilDone(jobId, batchNum, totalBatches, batchSize, recordsBefore, totalRecords, onProgress) {
  while (true) {
    await sleep(POLL_INTERVAL_MS);
    const res      = await api.get(`/admin/v1/issuers/bulk/${jobId}`);
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
 * uploadIssuers — maps deriveCdslIssuerSummary() rows to the backend issuerShape,
 * chunks them and POSTs each batch, polling until complete.
 *
 * Field mapping vs CDSL source:
 *   authorisedSignatory      ← issuerContactPersonName
 *   designationOfAuthSignatory ← contactPersonDesignation
 *   count                    ← totalIsin (Number)
 *   source                   = 'CDSL' (constant)
 *   issuerEmail2/3, gst*, pan, tan, cin, professional*, etc. → null (no CDSL equivalent)
 *
 * Returns { totalSucceeded, totalFailed, errors[] }.
 */
export async function uploadIssuers(issuerRows, onProgress) {
  const payload = issuerRows
    .map(row => ({
      issuerCode:                 row.issuerCode               || null,
      issuerId:                   row.issuerId                 || null,
      issuerName:                 row.issuerName               || null,
      issuerAddress1:             row.issuerAddress1           || null,
      issuerAddress2:             row.issuerAddress2           || null,
      issuerAddress3:             row.issuerAddress3           || null,
      issuerCity:                 row.issuerCity               || null,
      issuerState:                row.issuerState              || null,
      issuerCountry:              row.issuerCountry            || null,
      issuerZipCode:              row.issuerZipCode            || null,
      issuerPhone1:               row.issuerPhone1             || null,
      issuerPhone2:               row.issuerPhone2             || null,
      issuerEmail:                sanitiseEmail(row.issuerCode, 'issuerEmail',       row.issuerEmail),
      issuerEmail2:               sanitiseEmail(row.issuerCode, 'issuerEmail2',      row.issuerEmail2),
      issuerEmail3:               sanitiseEmail(row.issuerCode, 'issuerEmail3',      row.issuerEmail3),
      professionalEmail:          sanitiseEmail(row.issuerCode, 'professionalEmail', row.professionalEmail),
      authorisedSignatory:        row.issuerContactPersonName  || null,
      designationOfAuthSignatory: row.contactPersonDesignation || null,
      count:                      Number(row.totalIsin)        || null,
      source:                     row.source || 'CDSL',
    }))
    .filter(r => r.issuerCode);

  const chunks = [];
  for (let i = 0; i < payload.length; i += ISSUER_CHUNK_SIZE) {
    chunks.push(payload.slice(i, i + ISSUER_CHUNK_SIZE));
  }

  let totalSucceeded = 0;
  let totalFailed    = 0;
  const allErrors    = [];

  for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
    const chunk         = chunks[batchIdx];
    const recordsBefore = batchIdx * ISSUER_CHUNK_SIZE;
    const batchNum      = batchIdx + 1;

    onProgress({
      phase:        'posting',
      batchNum,
      totalBatches:  chunks.length,
      recordsBefore,
      totalRecords:  payload.length,
    });

    const res = await api.post('/admin/v1/issuers/bulk', chunk);

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
