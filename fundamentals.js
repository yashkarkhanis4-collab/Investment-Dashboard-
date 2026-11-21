// Merge baseline fundamentals with cached FMP results.
// Output per symbol: { currency, note, fields: { key: {v, asOf, src} } }

import { BASELINE } from '../data/baseline.js';

export const FIELDS = ['ebitda', 'netDebt', 'fcf', 'shares', 'fwdEps', 'shortFloat', 'dtc', 'beta', 'lastEarnings', 'nextEarnings', 'catalyst'];

// skip: FMP fields to ignore for this symbol (e.g. ['shares'] for multi-class names).
export function mergeFundamentals(symbol, fmp, skip = []) {
  const b = BASELINE[symbol];
  const out = { currency: b?.currency || 'USD', note: b?.note || null, fields: {}, fmpErrors: fmp?.errors || null, fmpFetchedAt: fmp?.fetchedAt || null };
  if (b) {
    for (const k of FIELDS) {
      if (b[k] !== undefined && b[k] !== null) out.fields[k] = { v: b[k], asOf: b.asOf, src: b.src };
    }
  }
  // FMP only overrides USD-denominated names.
  if (fmp?.fields && out.currency === 'USD') {
    out.fmpErrors = { ...(out.fmpErrors || {}) };
    for (const [k, f] of Object.entries(fmp.fields)) {
      if (!f || f.v === null || f.v === undefined) continue;
      if (skip.includes(k)) continue;
      // Guard against share-class mismatches (e.g. FMP counting only Class A).
      if (k === 'shares' && b?.shares && Math.abs(f.v / b.shares - 1) > 0.4) {
        out.fmpErrors.shares = `FMP share count differs from baseline by ${Math.round((f.v / b.shares - 1) * 100)}% - kept baseline`;
        continue;
      }
      out.fields[k] = { v: f.v, asOf: f.asOf || fmp.fetchedAt?.slice(0, 10), src: 'FMP' };
    }
  }
  return out;
}
