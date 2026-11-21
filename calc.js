// Pure calculation layer for the watchlist. No DOM access; unit-tested in tests/.
//
// Inputs
//   q    quote stats in the stock's trading currency (from /api/prices)
//   f    merged fundamentals (from /api/fundamentals): {currency, fields:{k:{v,asOf,src}}}
//   fx   { KRW: {last: KRW per USD}, ... }
//   spx  S&P 500 stats (for relative performance)
//
// Conventions match the Sheet: amounts in USD bn, n.m. when a multiple is not meaningful.

export const NM = 'n.m.';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fv = (f, k) => (f && f.fields && f.fields[k] && f.fields[k].v !== undefined ? f.fields[k].v : null);
const chg = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b - 1 : null);

/** Local-currency units per USD, or 1 for USD. null if unavailable. */
export function fxRate(currency, fx) {
  if (!currency || currency === 'USD') return 1;
  if (currency === 'GBp') return isNum(fx?.GBP?.last) ? fx.GBP.last * 100 : null;
  if (currency === 'ILA') return isNum(fx?.ILS?.last) ? fx.ILS.last * 100 : null;
  const r = fx?.[currency]?.last;
  return isNum(r) ? r : null;
}

export function computeRow(q, f, fx, spx) {
  const out = { errors: [] };
  if (!q || q.error) {
    out.errors.push(q?.error || 'No price data');
    return out;
  }
  const qRate = fxRate(q.currency, fx);
  const fCur = f?.currency || q.currency || 'USD';
  const fRate = fxRate(fCur, fx);
  if (qRate === null) out.errors.push(`No FX rate for ${q.currency}`);

  out.priceLocal = q.last;
  out.currency = q.currency;
  out.priceUSD = qRate ? q.last / qRate : null;
  out.chg1d = chg(q.last, q.p1);
  out.chg52w = chg(q.last, q.p252);
  out.offHigh = chg(q.last, q.hi52);
  const r3 = chg(q.last, q.p63);
  const s3 = spx ? chg(spx.last, spx.p63) : null;
  out.relPerf3m = isNum(r3) && isNum(s3) ? (1 + r3) / (1 + s3) - 1 : null;

  const toUsd = (x) => (isNum(x) && fRate ? x / fRate : null);
  const shares = fv(f, 'shares');
  const ebitda = toUsd(fv(f, 'ebitda'));
  const netDebt = toUsd(fv(f, 'netDebt'));
  const fcf = toUsd(fv(f, 'fcf'));
  const eps = fv(f, 'fwdEps');

  out.mktCap = isNum(out.priceUSD) && isNum(shares) ? out.priceUSD * shares : null;
  out.ev = isNum(out.mktCap) && isNum(netDebt) ? out.mktCap + netDebt : null;
  out.ebitda = ebitda;
  out.netDebt = netDebt;
  out.fcf = fcf;

  // Forward EPS is in the stock's trading currency, so P/E uses local price.
  out.fwdPE = isNum(eps) ? (eps > 0 ? q.last / eps : NM) : f && fv(f, 'shares') !== null ? NM : null;
  out.evEbitda = isNum(ebitda) ? (ebitda > 0 && isNum(out.ev) ? out.ev / ebitda : NM) : null;
  out.fcfYield = isNum(fcf) && isNum(out.mktCap) && out.mktCap > 0 ? fcf / out.mktCap : null;
  out.netLev = isNum(ebitda) ? (ebitda > 0 && isNum(netDebt) ? netDebt / ebitda : NM) : null;

  out.shortFloat = fv(f, 'shortFloat');
  out.dtc = fv(f, 'dtc');
  out.beta = fv(f, 'beta');
  out.lastEarnings = fv(f, 'lastEarnings');
  out.nextEarnings = fv(f, 'nextEarnings');
  out.flags = flags(out);
  return out;
}

export function flags(r) {
  const fl = [];
  if (isNum(r.fcfYield) && r.fcfYield < 0) fl.push({ key: 'fcf', level: 'red', label: 'Neg FCF' });
  if (isNum(r.netLev) && r.netLev > 1) fl.push({ key: 'lev', level: 'amber', label: `Lev ${r.netLev.toFixed(1)}x` });
  if (isNum(r.shortFloat) && r.shortFloat > 0.03) fl.push({ key: 'si', level: 'amber', label: `SI ${(r.shortFloat * 100).toFixed(1)}%` });
  if (isNum(r.dtc) && r.dtc > 5) fl.push({ key: 'dtc', level: 'red', label: `DTC ${r.dtc.toFixed(1)}` });
  return fl;
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Staleness thresholds (calendar days) by data type. */
export const STALE_DAYS = { price: 4, fundamentals: 120, shortInterest: 45, macro: 5 };

// ---- Macro signals ---------------------------------------------------------

const byId = (macro) => {
  const m = {};
  for (const g of macro || []) for (const it of g.items) m[it.id] = it;
  return m;
};

export function macroSignals(macro) {
  const m = byId(macro);
  const ok = (it) => it && !it.error && isNum(it.last);
  const s = [];
  const vt = m.vixterm;
  s.push({
    id: 'vixterm',
    label: 'VIX term structure (VIX / VIX3M)',
    value: ok(vt) ? vt.last : null,
    fmt: 'ratio',
    alert: ok(vt) && vt.last > 1,
    read: ok(vt) ? (vt.last > 1 ? 'Inverted - acute stress' : 'Normal contango') : 'Data unavailable',
  });
  const t2 = m.ust2;
  const t10 = m.ust10;
  const curve = ok(t2) && ok(t10) ? (t10.last - t2.last) * 100 : null;
  const curve1m = ok(t2) && ok(t10) && isNum(t2.p21) && isNum(t10.p21) ? curve - (t10.p21 - t2.p21) * 100 : null;
  s.push({
    id: 'curve',
    label: 'US 2s10s curve',
    value: curve,
    fmt: 'bp',
    sub: isNum(curve1m) ? curve1m : null,
    alert: isNum(curve) && curve < 0,
    read: isNum(curve) ? (curve < 0 ? 'Inverted' : isNum(curve1m) ? (curve1m > 0 ? 'Steepening over 1M' : 'Flattening over 1M') : 'Positive') : 'Data unavailable',
  });
  const oneM = (it) => (ok(it) && isNum(it.p21) ? it.last / it.p21 - 1 : null);
  const rs = oneM(m.rspspy);
  s.push({ id: 'rspspy', label: 'Equal-wt vs cap-wt (RSP/SPY), 1M', value: rs, fmt: 'pct', read: isNum(rs) ? (rs > 0 ? 'Breadth improving vs mega-caps' : 'Mega-cap leadership') : 'Data unavailable' });
  const cg = oneM(m.cugold);
  s.push({ id: 'cugold', label: 'Copper / Gold, 1M', value: cg, fmt: 'pct', read: isNum(cg) ? (cg > 0 ? 'Growth > fear' : 'Fear > growth') : 'Data unavailable' });
  const hy = m.hyoas;
  const hy1m = ok(hy) && isNum(hy.p21) ? (hy.last - hy.p21) * 100 : null;
  s.push({
    id: 'hyoas',
    label: 'HY OAS, 1M change',
    value: hy1m,
    fmt: 'bp',
    sub: ok(hy) ? hy.last * 100 : null,
    subLabel: 'level',
    alert: isNum(hy1m) && hy1m > 50,
    read: isNum(hy1m) ? (hy1m > 50 ? 'Credit widening sharply' : hy1m > 15 ? 'Credit softening' : hy1m < -15 ? 'Credit tightening' : 'Credit stable') : 'Data unavailable',
  });
  const sx = oneM(m.soxspx);
  s.push({ id: 'soxspx', label: 'SOX vs S&P 500, 1M', value: sx, fmt: 'pct', alert: isNum(sx) && sx < -0.1, read: isNum(sx) ? (sx < 0 ? 'Semis underperforming' : 'Semis leading') : 'Data unavailable' });
  return s;
}

/** Changes for a macro row. Yields/spreads in bp, everything else in %. */
export function macroChanges(it) {
  const bp = it.unit === 'yield' || it.unit === 'spread';
  const d = (ref) => (isNum(it.last) && isNum(ref) ? (bp ? (it.last - ref) * 100 : ref !== 0 ? it.last / ref - 1 : null) : null);
  return {
    bp,
    c1d: d(it.p1),
    c1w: d(it.p5),
    c1m: d(it.p21),
    ytd: d(it.ytdBase),
    offHigh: d(it.hi52),
    vsMa: d(it.ma200),
  };
}
