// Calculations checked against the numbers in the "L/S Research Dashboard" Sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRow, macroSignals, macroChanges, NM } from '../public/calc.js';
import { mergeFundamentals } from '../lib/fundamentals.js';
import { seriesStats, ratioPoints } from '../lib/stats.js';

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
const q = (last, extra = {}) => ({ currency: 'USD', last, p1: last, p5: last, p21: last, p63: last, p252: last, hi52: last, ...extra });
const FX = { KRW: { last: 1345.595 } };

test('AAPL: market cap, EV, multiples match the Sheet', () => {
  const r = computeRow(q(342.56), mergeFundamentals('AAPL'), FX, null);
  close(r.mktCap, 4980.65, 0.05);
  close(r.ev, 4938.19, 0.05);
  close(r.fwdPE, 36.37, 0.01);
  close(r.evEbitda, 28.80, 0.01);
  close(r.fcfYield, 0.02735, 0.0001);
  close(r.netLev, -0.2476, 0.0005);
});

test('Samsung: KRW price converts to USD, P/E stays in KRW', () => {
  const r = computeRow({ ...q(183100), currency: 'KRW' }, mergeFundamentals('005930.KS'), FX, null);
  close(r.priceUSD, 136.07, 0.01);
  close(r.mktCap, 868.98, 0.1);
  close(r.ev, 722.11, 0.1);
  close(r.fwdPE, 2.57, 0.01);
  close(r.evEbitda, 3.00, 0.01);
  close(r.fcfYield, 0.1737, 0.0005);
});

test('SK Hynix matches Sheet', () => {
  const r = computeRow({ ...q(1113000), currency: 'KRW' }, mergeFundamentals('000660.KS'), FX, null);
  close(r.priceUSD, 827.14, 0.01);
  close(r.mktCap, 602.9, 0.1);
  close(r.fwdPE, 2.23, 0.01);
});

test('CRWV: net leverage 11.9x, flags, fwd P/E n.m.', () => {
  const r = computeRow(q(39.51), mergeFundamentals('CRWV'), FX, null);
  close(r.netLev, 11.92, 0.01);
  close(r.fcfYield, -0.9293, 0.001);
  assert.equal(r.fwdPE, NM);
  const keys = r.flags.map((f) => f.key).sort();
  assert.deepEqual(keys, ['fcf', 'lev', 'si']);
});

test('ANT: negative EBITDA gives n.m. multiples', () => {
  const r = computeRow(q(88.91), mergeFundamentals('ANT'), FX, null);
  close(r.mktCap, 1162.05, 0.05);
  assert.equal(r.evEbitda, NM);
  assert.equal(r.netLev, NM);
  assert.equal(r.fwdPE, NM);
});

test('ORCL and AMZN leverage flags', () => {
  const o = computeRow(q(101.19), mergeFundamentals('ORCL'), FX, null);
  close(o.netLev, 3.84, 0.01);
  assert.ok(o.flags.some((f) => f.key === 'lev'));
  const a = computeRow(q(246.82), mergeFundamentals('AMZN'), FX, null);
  close(a.netLev, 1.04, 0.01);
  assert.ok(a.flags.some((f) => f.key === 'fcf'));
});

test('Missing FX rate is reported, not silently wrong', () => {
  const r = computeRow({ ...q(183100), currency: 'KRW' }, mergeFundamentals('005930.KS'), {}, null);
  assert.equal(r.priceUSD, null);
  assert.ok(r.errors.some((e) => e.includes('FX')));
});

test('Price error passes through', () => {
  const r = computeRow({ error: 'Rate limited (429)' }, mergeFundamentals('AAPL'), FX, null);
  assert.deepEqual(r.errors, ['Rate limited (429)']);
});

test('Relative performance vs S&P', () => {
  const r = computeRow(q(110, { p63: 100 }), mergeFundamentals('AAPL'), FX, { last: 105, p63: 100 });
  close(r.relPerf3m, 1.1 / 1.05 - 1, 1e-9);
});

test('FMP overrides baseline for USD names; share-count guard', () => {
  const m = mergeFundamentals('AAPL', { fields: { ebitda: { v: 180, asOf: '2026-12-31' }, shares: { v: 7 } }, fetchedAt: '2027-01-02T00:00:00Z' });
  assert.equal(m.fields.ebitda.v, 180);
  assert.equal(m.fields.ebitda.src, 'FMP');
  assert.equal(m.fields.shares.v, 14.5395); // 7bn is >40% off -> baseline kept
  assert.ok(m.fmpErrors.shares);
  const k = mergeFundamentals('005930.KS', { fields: { ebitda: { v: 1 } } });
  assert.equal(k.fields.ebitda.v, 323680); // FMP never overrides KRW names
  const g = mergeFundamentals('GOOGL', { fields: { shares: { v: 12.1 } } }, ['shares']);
  assert.equal(g.fields.shares.v, 12.3069);
});

test('seriesStats: changes, YTD base, 52w range, flat detection', () => {
  const pts = [];
  const start = Date.parse('2025-06-02T00:00:00Z');
  for (let i = 0; i < 400; i++) pts.push({ d: new Date(start + i * 86400000).toISOString().slice(0, 10), v: 100 + i });
  const s = seriesStats(pts);
  assert.equal(s.last, 499);
  assert.equal(s.p1, 498);
  assert.equal(s.p5, 494);
  assert.equal(s.ytdBase, 100 + (Date.parse('2025-12-31') - start) / 86400000);
  assert.equal(s.hi52, 499);
  assert.equal(s.flat, false);
  const flat = seriesStats([...pts.slice(0, -6), ...Array(6).fill(0).map((_, k) => ({ d: `2026-07-0${k + 1}`, v: 7 }))]);
  assert.equal(flat.flat, true);
});

test('ratioPoints aligns on common dates', () => {
  const r = ratioPoints([{ d: 'a', v: 10 }, { d: 'b', v: 20 }], [{ d: 'b', v: 4 }, { d: 'c', v: 5 }], 1000);
  assert.deepEqual(r, [{ d: 'b', v: 5000 }]);
});

test('Macro signals and bp changes', () => {
  const macro = [
    { group: 'Rates', items: [
      { id: 'ust2', unit: 'yield', last: 4.0, p21: 4.2 },
      { id: 'ust10', unit: 'yield', last: 4.5, p21: 4.5 },
    ] },
    { group: 'Credit', items: [{ id: 'hyoas', unit: 'spread', last: 3.5, p21: 2.9 }] },
    { group: 'Ratios', items: [{ id: 'vixterm', unit: 'ratio', last: 1.16 }] },
  ];
  const s = Object.fromEntries(macroSignals(macro).map((x) => [x.id, x]));
  assert.equal(s.vixterm.alert, true);
  close(s.curve.value, 50, 1e-9);
  close(s.curve.sub, 20, 1e-9); // steepened 20bp over 1M
  close(s.hyoas.value, 60, 1e-9);
  assert.equal(s.hyoas.read, 'Credit widening sharply');
  const c = macroChanges({ unit: 'yield', last: 4.912, p1: 5.052, p5: 5.154, p21: 4.953, ytdBase: 4.163, hi52: 5.311, ma200: 4.6 });
  close(c.c1d, -14, 1e-6);
  assert.equal(c.bp, true);
});
