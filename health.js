// GET /api/health
// Without the passcode: which settings are present (names only, never values).
// With the passcode (sent by the app's Status panel): also tests each data source.

import { checkPass, passcodeRequired } from '../lib/auth.js';
import { fetchJson } from '../lib/http.js';
import { getChart } from '../lib/yahoo.js';
import { getSeries } from '../lib/fred.js';
import * as redis from '../lib/redis.js';

async function probe(fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t0, detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, status: e.status ?? null, error: e.message };
  }
}

export default async function handler(req, res) {
  const env = {
    FMP_API_KEY: !!process.env.FMP_API_KEY,
    FRED_API_KEY: !!process.env.FRED_API_KEY,
    DASHBOARD_PASSCODE: passcodeRequired(),
    REDIS: redis.redisConfigured(),
  };
  const out = { time: new Date().toISOString(), env };

  if (!checkPass(req.headers['x-dash-pass'])) {
    out.note = 'Open the app and use Status to run live source tests.';
    return res.status(200).json(out);
  }

  const [r, y, fred, fmp] = await Promise.all([
    probe(async () => {
      if (!env.REDIS) throw Object.assign(new Error('Not configured (edits will not sync between devices)'), { status: null });
      return (await redis.ping()) ? 'PONG' : 'Unexpected reply';
    }),
    probe(async () => {
      const c = await getChart('AAPL');
      return `AAPL ${c.points.at(-1).v.toFixed(2)} on ${c.points.at(-1).d}`;
    }),
    probe(async () => {
      const p = await getSeries('DGS10');
      return `US10Y ${p.at(-1).v}% on ${p.at(-1).d}`;
    }),
    probe(async () => {
      if (!env.FMP_API_KEY) throw Object.assign(new Error('FMP_API_KEY not set'), { status: null });
      const j = await fetchJson(
        `https://financialmodelingprep.com/stable/shares-float?symbol=AAPL&apikey=${encodeURIComponent(process.env.FMP_API_KEY)}`,
        { retries: 0 }
      );
      const row = Array.isArray(j) ? j[0] : j;
      if (!row || row['Error Message']) throw new Error(row?.['Error Message'] || 'Empty response');
      return `AAPL shares ${(row.outstandingShares / 1e9).toFixed(2)}bn (uses 1 of today's calls)`;
    }),
  ]);
  out.sources = { redis: r, yahoo: y, fred, fmp };
  res.status(200).json(out);
}
