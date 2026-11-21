// FRED (St. Louis Fed) series: Treasury yields, real yields, credit spreads.

import { fetchJson, HttpError } from './http.js';

export function parseObservations(json) {
  const obs = json?.observations;
  if (!Array.isArray(obs)) throw new HttpError(502, json?.error_message || 'Unexpected FRED response');
  const points = [];
  for (const o of obs) {
    const v = parseFloat(o.value);
    if (Number.isFinite(v)) points.push({ d: o.date, v });
  }
  if (points.length < 2) throw new HttpError(404, 'FRED returned no data');
  return points;
}

export async function getSeries(seriesId) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new HttpError(401, 'FRED_API_KEY not set');
  const start = new Date(Date.now() - 800 * 86400000).toISOString().slice(0, 10);
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(key)}&file_type=json&observation_start=${start}`;
  return parseObservations(await fetchJson(url));
}
