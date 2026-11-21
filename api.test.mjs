// API functions run against the mock network layer (tests/mock.mjs),
// including partial failures. No keys or internet needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockFetch } from './mock.mjs';
import { parseFmp } from '../lib/fmp.js';
import { parseChart } from '../lib/yahoo.js';

installMockFetch({ redis: true });
process.env.DASHBOARD_PASSCODE = 'test-pass';

const prices = (await import('../api/prices.js')).default;
const fundamentals = (await import('../api/fundamentals.js')).default;
const state = (await import('../api/state.js')).default;
const health = (await import('../api/health.js')).default;
const auth = (await import('../api/auth.js')).default;

function call(handler, { method = 'GET', query = {}, body, pass = 'test-pass' } = {}) {
  return new Promise((resolve) => {
    const req = { method, query, body, headers: pass ? { 'x-dash-pass': pass } : {} };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); },
    };
    handler(req, res);
  });
}

test('passcode: wrong or missing -> 401, right -> ok', async () => {
  assert.equal((await call(prices, { pass: 'nope' })).status, 401);
  assert.equal((await call(prices, { pass: '' })).status, 401);
  assert.equal((await call(auth, { method: 'POST', body: { pass: 'nope' }, pass: '' })).status, 401);
  assert.equal((await call(auth, { method: 'POST', body: { pass: 'test-pass' }, pass: '' })).status, 200);
  const h = await call(health, { pass: '' });
  assert.equal(h.body.sources, undefined); // no live tests without passcode
  assert.equal(h.body.env.FMP_API_KEY, true);
});

test('prices: full refresh with partial failures', async () => {
  const r = await call(prices, { query: { symbols: 'AAPL,005930.KS,ANT,BADSYM' } });
  assert.equal(r.status, 200);
  const q = r.body.quotes;
  assert.equal(q.AAPL.last, 342.56);
  assert.equal(q.AAPL.p1, 349.21);
  assert.equal(q.AAPL.asOf, '2026-11-20');
  assert.equal(q['005930.KS'].currency, 'KRW');
  assert.equal(q['005930.KS'].asOf, '2026-11-20');
  assert.ok(r.body.fx.KRW.last > 1000);
  assert.equal(q.ANT.n, 2); // IPO'd Nov 19: two points of history, still works
  assert.match(q.BADSYM.error, /not found/i);
  const items = Object.fromEntries(r.body.macro.flatMap((g) => g.items).map((i) => [i.id, i]));
  assert.match(items.skew.error, /429/); // retry exhausted
  assert.ok(!items.usdcny.error); // 429 once, then retry succeeded
  assert.match(items.real10.error, /no data/i); // FRED empty
  assert.ok(Math.abs(items.vixterm.last - 35.89 / 30.94) < 1e-6);
  assert.equal(items.ust10.last, 4.91);
  assert.equal(r.body.failed, 3);
});

test('fundamentals: GET = baseline; POST = FMP with fallbacks + budget + cache', async () => {
  const g = await call(fundamentals, { query: { symbols: 'AAPL,ORCL,MSFT,005930.KS' } });
  assert.equal(g.body.fundamentals.AAPL.fields.ebitda.src, 'StockAnalysis.com');
  const p = await call(fundamentals, { method: 'POST', body: { symbols: ['AAPL', 'ORCL', 'MSFT', '005930.KS', 'TSM'] } });
  assert.equal(p.status, 200);
  const f = p.body.fundamentals;
  assert.equal(f.AAPL.fields.ebitda.src, 'FMP');
  assert.ok(Math.abs(f.AAPL.fields.ebitda.v - 174.2) < 1e-9);
  assert.equal(f.AAPL.fields.fwdEps.v, 9.65); // next FY, not the past or later year
  assert.equal(f.AAPL.fields.nextEarnings.v, '2027-01-28');
  assert.equal(f.AAPL.fields.shortFloat.src, 'StockAnalysis.com'); // FMP never provides it
  assert.equal(f.ORCL.fields.fwdEps.src, 'StockAnalysis.com'); // 403 -> baseline kept
  assert.equal(f.ORCL.fields.shares.v, 3.1177); // 1.2bn guard -> baseline kept
  assert.ok(f.ORCL.fmpErrors.shares);
  assert.equal(f.MSFT.fields.ebitda.src, 'StockAnalysis.com'); // empty income stmt
  assert.equal(f['005930.KS'].fields.ebitda.v, 323680); // non-US untouched
  assert.deepEqual(p.body.summary.updated.sort(), ['AAPL', 'MSFT', 'ORCL']);
  assert.equal(p.body.summary.callsMade, 18);
  assert.equal(p.body.fmp.callsToday, 18);
  // Second run within 20h: served from cache, no calls
  const p2 = await call(fundamentals, { method: 'POST', body: { symbols: ['AAPL'] } });
  assert.equal(p2.body.summary.callsMade, 0);
  assert.equal(p2.body.fundamentals.AAPL.fields.ebitda.src, 'FMP');
  // And GET now returns the cached FMP values
  const g2 = await call(fundamentals, { query: { symbols: 'AAPL' } });
  assert.equal(g2.body.fundamentals.AAPL.fields.ebitda.src, 'FMP');
});

test('fundamentals: budget stops before the daily cap', async () => {
  const many = Array.from({ length: 60 }, (_, i) => 'T' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)));
  const p = await call(fundamentals, { method: 'POST', body: { symbols: many } });
  assert.ok(p.body.fmp.callsToday <= 240);
  assert.ok(p.body.summary.skipped.some((s) => /budget/.test(s.reason)));
});

test('state: default, save, sanitise, reload', async () => {
  const g = await call(state);
  assert.equal(g.body.isDefault, true);
  assert.equal(g.body.state.tickers.length, 19);
  const s = g.body.state;
  s.edits.NVDA = { ls: 'Long', thesis: 'AI capex', catalyst: 'Earnings Feb', junk: 1 };
  s.edits.AAPL = { ls: 'Bogus' };
  s.tickers.push({ symbol: 'qcom', industry: 'Mobile SoCs' }, { symbol: 'bad sym!', industry: 'x' });
  const p = await call(state, { method: 'PUT', body: { state: s } });
  assert.equal(p.body.ok, true);
  const g2 = await call(state);
  assert.equal(g2.body.isDefault, false);
  assert.equal(g2.body.state.edits.NVDA.ls, 'Long');
  assert.equal(g2.body.state.edits.NVDA.junk, undefined);
  assert.equal(g2.body.state.edits.AAPL.ls, 'Watch');
  assert.ok(g2.body.state.tickers.some((t) => t.symbol === 'QCOM'));
  assert.ok(!g2.body.state.tickers.some((t) => t.symbol.includes(' ')));
});

test('health with passcode runs every source', async () => {
  const h = await call(health);
  assert.equal(h.body.sources.yahoo.ok, true);
  assert.equal(h.body.sources.fred.ok, true);
  assert.equal(h.body.sources.fmp.ok, true);
  assert.equal(h.body.sources.redis.ok, true);
});

test('parsers handle odd payloads', () => {
  assert.throws(() => parseChart({ chart: { result: null, error: { description: 'No data found' } } }), /No data found/);
  const out = parseFmp({ inc: { data: [{ reportedCurrency: 'TWD', ebitda: 5e12 }] }, cf: { err: 'Rate limited (429)' }, bs: { data: [] }, sf: { data: {} }, est: { data: 'x' }, earn: { data: [] } });
  assert.deepEqual(out.fields, {});
  assert.match(out.errors.ebitda, /TWD/);
  assert.match(out.errors.fcf, /429/);
});
