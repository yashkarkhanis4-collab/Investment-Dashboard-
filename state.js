// GET /api/state  -> { sync, state }
// PUT /api/state  { state } -> saves your watchlist + edits (L/S, thesis, catalyst)

import { requireAuth } from '../lib/auth.js';
import { methodNotAllowed, readBody } from '../lib/api.js';
import { DEFAULT_WATCHLIST, SYMBOL_RE } from '../lib/universe.js';
import * as redis from '../lib/redis.js';

const KEY = 'lsdash:state:v1';
const MAX_BYTES = 200_000;
const LS = ['Long', 'Short', 'Watch'];

export function defaultState() {
  return {
    version: 1,
    tickers: DEFAULT_WATCHLIST.map(({ symbol, industry, label }) => ({ symbol, industry, ...(label ? { label } : {}) })),
    edits: {},
    updatedAt: null,
  };
}

const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : '');

/** Keep only known fields with sane sizes. */
export function sanitize(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.tickers)) return null;
  const tickers = [];
  for (const t of state.tickers.slice(0, 60)) {
    const symbol = str(t?.symbol, 15).toUpperCase();
    if (!SYMBOL_RE.test(symbol) || tickers.some((x) => x.symbol === symbol)) continue;
    const row = { symbol, industry: str(t.industry, 80) };
    if (t.label) row.label = str(t.label, 40);
    tickers.push(row);
  }
  const edits = {};
  for (const [sym, e] of Object.entries(state.edits || {})) {
    if (!SYMBOL_RE.test(sym) || !e || typeof e !== 'object') continue;
    edits[sym.toUpperCase()] = {
      ls: LS.includes(e.ls) ? e.ls : 'Watch',
      thesis: str(e.thesis, 4000),
      catalyst: typeof e.catalyst === 'string' ? str(e.catalyst, 300) : undefined,
    };
  }
  return { version: 1, tickers, edits, updatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT']);
  if (!requireAuth(req, res)) return;
  const sync = redis.redisConfigured();

  if (req.method === 'GET') {
    let state = null;
    let error = null;
    if (sync) {
      try {
        state = await redis.getJson(KEY);
      } catch (e) {
        error = e.message;
      }
    }
    return res.status(200).json({ sync: sync && !error, error, state: state || defaultState(), isDefault: !state });
  }

  const body = readBody(req);
  if (JSON.stringify(body).length > MAX_BYTES) return res.status(413).json({ error: 'State too large' });
  const clean = sanitize(body.state);
  if (!clean) return res.status(400).json({ error: 'Invalid state' });
  if (!sync) return res.status(200).json({ ok: false, sync: false, state: clean });
  try {
    await redis.setJson(KEY, clean);
    res.status(200).json({ ok: true, sync: true, state: clean });
  } catch (e) {
    res.status(502).json({ ok: false, sync: true, error: e.message });
  }
}
