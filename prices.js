// GET /api/prices?symbols=AAPL,MSFT,...
// Prices + 2y daily history stats for the watchlist, plus the full macro set.

import { requireAuth } from '../lib/auth.js';
import { parseSymbols, methodNotAllowed } from '../lib/api.js';
import { pool } from '../lib/http.js';
import { getChart } from '../lib/yahoo.js';
import { getSeries } from '../lib/fred.js';
import { seriesStats, ratioPoints } from '../lib/stats.js';
import { MACRO_GROUPS, HIDDEN_SERIES, DEFAULT_WATCHLIST } from '../lib/universe.js';

const fxSymbol = (cur) => `${cur.toUpperCase()}=X`;

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!requireAuth(req, res)) return;

  const watch = req.query.symbols ? parseSymbols(req.query.symbols) : DEFAULT_WATCHLIST.map((t) => t.symbol);
  const macroItems = MACRO_GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
  const yahooMacro = [...macroItems.filter((i) => i.src === 'yahoo'), ...HIDDEN_SERIES];
  const fredMacro = macroItems.filter((i) => i.src === 'fred');

  // 1) Yahoo: watchlist + macro (de-duplicated)
  const ySymbols = [...new Set([...watch, ...yahooMacro.map((i) => i.symbol)])];
  const charts = new Map();
  await pool(ySymbols, 8, async (sym) => {
    try {
      charts.set(sym, await getChart(sym));
    } catch (e) {
      charts.set(sym, { error: e.message || 'Failed' });
    }
  });

  // 2) FX for any non-USD watchlist names not already loaded
  const needFx = new Set();
  for (const sym of watch) {
    const c = charts.get(sym);
    if (c && !c.error && c.currency) {
      const cur = c.currency === 'GBp' ? 'GBP' : c.currency === 'ILA' ? 'ILS' : c.currency;
      if (cur !== 'USD') needFx.add(cur);
    }
  }
  await pool([...needFx].filter((c) => !charts.has(fxSymbol(c))), 4, async (cur) => {
    try {
      charts.set(fxSymbol(cur), await getChart(fxSymbol(cur)));
    } catch (e) {
      charts.set(fxSymbol(cur), { error: e.message || 'Failed' });
    }
  });

  // 3) FRED series
  const fred = new Map();
  await pool(fredMacro, 4, async (it) => {
    try {
      fred.set(it.id, await getSeries(it.symbol));
    } catch (e) {
      fred.set(it.id, { error: e.message || 'Failed' });
    }
  });

  // Assemble watchlist quotes
  const quotes = {};
  for (const sym of watch) {
    const c = charts.get(sym);
    if (!c || c.error) quotes[sym] = { error: c?.error || 'No data' };
    else quotes[sym] = { currency: c.currency, name: c.name, ...seriesStats(c.points) };
  }
  const fx = {};
  for (const cur of needFx) {
    const c = charts.get(fxSymbol(cur));
    fx[cur] = !c || c.error ? { error: c?.error || 'No data' } : { ...seriesStats(c.points) };
  }

  // Assemble macro
  const pointsById = new Map();
  for (const it of yahooMacro) {
    const c = charts.get(it.symbol);
    if (c && !c.error) pointsById.set(it.id, c.points);
  }
  for (const it of fredMacro) {
    const p = fred.get(it.id);
    if (Array.isArray(p)) pointsById.set(it.id, p);
  }
  const groups = MACRO_GROUPS.map((g) => ({
    group: g.group,
    items: g.items.map((it) => {
      const base = { id: it.id, name: it.name, src: it.src, symbol: it.symbol || it.of?.join('/'), unit: it.unit };
      let pts;
      if (it.src === 'ratio') {
        const [a, b] = it.of.map((id) => pointsById.get(id));
        if (!a || !b) return { ...base, error: 'Component data missing' };
        pts = ratioPoints(a, b, it.mult || 1);
      } else {
        pts = pointsById.get(it.id);
        if (!pts) {
          const err = it.src === 'fred' ? fred.get(it.id)?.error : charts.get(it.symbol)?.error;
          return { ...base, error: err || 'No data' };
        }
      }
      const st = seriesStats(pts);
      return st ? { ...base, ...st } : { ...base, error: 'Not enough history' };
    }),
  }));

  const failed = Object.values(quotes).filter((q) => q.error).length + groups.flatMap((g) => g.items).filter((i) => i.error).length;
  res.status(200).json({ generatedAt: new Date().toISOString(), quotes, fx, macro: groups, failed });
}
