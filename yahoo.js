// Yahoo Finance chart API (unofficial). All Yahoo-specific code lives here so
// the source can be swapped without touching the rest of the app.

import { fetchJson, HttpError } from './http.js';

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

function localDate(tsSec, gmtoffset) {
  return new Date((tsSec + (gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
}

/** Parse a v8 chart response into {currency, name, points:[{d,v}]}. Exported for tests. */
export function parseChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r) {
    const desc = json?.chart?.error?.description;
    throw new HttpError(404, desc ? `Yahoo: ${desc}` : 'No data returned');
  }
  const meta = r.meta || {};
  const ts = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const off = meta.gmtoffset || 0;
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const v = closes[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const d = localDate(ts[i], off);
    if (points.length && points[points.length - 1].d === d) points[points.length - 1].v = v;
    else points.push({ d, v });
  }
  // Fold in the latest market price (covers intraday and the case where the
  // daily bar for today hasn't been written yet).
  const rmp = meta.regularMarketPrice;
  if (Number.isFinite(rmp) && meta.regularMarketTime) {
    const d = localDate(meta.regularMarketTime, off);
    const lastPt = points[points.length - 1];
    if (!lastPt || d > lastPt.d) points.push({ d, v: rmp });
    else if (d === lastPt.d) lastPt.v = rmp;
  }
  if (points.length < 2) throw new HttpError(404, 'Not enough price history');
  return {
    currency: meta.currency || 'USD',
    name: meta.longName || meta.shortName || meta.symbol,
    points,
  };
}

export async function getChart(symbol) {
  let lastErr;
  for (const host of HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&includePrePost=false`;
    try {
      return parseChart(await fetchJson(url));
    } catch (e) {
      lastErr = e;
      if (e.status === 404) break; // a bad symbol won't be fixed by the other host
    }
  }
  throw lastErr;
}
