// Mock network layer for local testing (no API keys needed).
// Yahoo / FRED / FMP / Upstash responses are synthesised in their real formats,
// anchored to real Nov 20, 2026 closes, with deliberate failure cases:
//   ^SKEW      -> 429 on every attempt (retry exhausted -> row shows error)
//   CNY=X      -> 429 once, then OK (retry succeeds)
//   BADSYM     -> Yahoo "No data found" (404)
//   DFII10     -> FRED returns empty data
//   FMP        -> AAPL full data; analyst-estimates 403 for every other name;
//                 MSFT income statement empty; ORCL shares far off (guard test)

// [last, prevClose, start-of-history] - real closes on Nov 20 / Nov 19 2026
const WATCH = {
  AAPL: [342.56, 349.21], MSFT: [484.52, 498.3], GOOGL: [265.29, 272.66], AMZN: [246.82, 257.37],
  NVDA: [125.53, 145.98], META: [560.84, 596.22], TSLA: [345.82, 374.41], MU: [594.51, 690.44],
  AMD: [424.39, 489.19], INTC: [51.28, 55.72], '005930.KS': [183100, 196900, 'KRW'], '000660.KS': [1113000, 1183000, 'KRW'],
  TSM: [318.71, 352.09], AVGO: [304.41, 346.65], ASML: [1266.22, 1356.2], CRWV: [39.51, 44.91],
  ORCL: [101.19, 110.52], SPCX: [127.79, 138.43, 'USD', '2026-06-12'], ANT: [88.91, 97.17, 'USD', '2026-11-19'],
};
// [last, p1, p5, p21, ytdBase]
const MACRO = {
  '^GSPC': [6910.39, 7175.83, 7561.67, 7663.43, 6845.5], '^NDX': [25028.98, 26517.05, 27943.74, 28958.69, 25249.85],
  '^RUT': [2581.79, 2655.11, 2790.49, 2784.03, 2481.91], '^SOX': [8408.59, 9419.72, 10146.32, 10731.98, 7083.13],
  RSP: [207.44, 211.63, 221.16, 218.22, 191.56], SPY: [689.81, 715.87, 754.37, 763.96, 681.92],
  '^KS11': [4869.96, 5137.89, 5290.53, 5533.77, 4214.17], '^TWII': [36033.29, 38426.89, 43675.12, 46292.93, 28963.6],
  '^N225': [56436.65, 59444.21, 61142.35, 64621.24, 50339.48], '^STOXX50E': [5941.95, 6113.86, 6386.86, 6087.01, 5796.22],
  '^HSI': [22410.8, 22841.62, 23637.6, 22934.68, 25630.54], '^STI': [4975.17, 5079.49, 5231.84, 5437.99, 4646.21],
  '^VIX': [35.89, 28.44, 19.3, 19.03, 14.95], '^VIX3M': [30.94, 27.03, 20.62, 20.12, 18.18], '^MOVE': [106.31, 96.04, 98.79, 95.94, 63.96],
  '^SKEW': [138.84, 140.86, 147.14, 152.39, 148.7], HYG: [76.33, 76.53, 76.94, 77.1, 80.63], LQD: [103.69, 103.08, 102.81, 104.28, 110.19],
  'DX-Y.NYB': [103.84, 103.9, 103.41, 101.61, 98.28], 'JPY=X': [159.707, 159.381, 159.875, 158.132, 156.413],
  'KRW=X': [1345.595, 1330.4, 1333.78, 1325.59, 1437.91], 'TWD=X': [33.026, 32.93, 32.939, 32.366, 31.244],
  'EURUSD=X': [1.09697, 1.0972, 1.10502, 1.12347, 1.17473], 'CNY=X': [6.6772, 6.6665, 6.671, 6.6779, 6.9961],
  'CL=F': [83.62, 83.21, 88.56, 99.47, 57.42], 'GC=F': [3539, 3685.5, 3886.3, 4060.4, 4341.1], 'HG=F': [5.465, 5.625, 6.0795, 6.3625, 5.63],
  'BTC-USD': [57500, 61901.82, 65305.06, 77198.21, 87508.83],
};
const FRED = {
  DGS2: [4.12, 4.15, 4.22, 4.05, 3.48], DGS10: [4.91, 5.05, 5.15, 4.95, 4.16], DGS30: [5.3, 5.4, 5.48, 5.29, 4.84],
  DFII10: null, BAMLH0A0HYM2: [3.62, 3.48, 3.21, 2.98, 2.9], BAMLC0A0CM: [1.04, 1.01, 0.97, 0.92, 0.86],
};

const END = '2026-11-20';
function tradingDays(from, to) {
  const out = [];
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
/** Synthetic daily series that hits the given anchors exactly. */
function series(key, last, p1, p5, p21, ytd, start = '2024-11-20') {
  const days = tradingDays(start, END);
  const n = days.length;
  const r = rng(key);
  const ytdIdx = days.findIndex((d) => d >= '2026-01-01') - 1;
  const anchors = [[0, (ytd ?? last) * (0.85 + r() * 0.2)]];
  if (ytd && ytdIdx > 0) anchors.push([ytdIdx, ytd]);
  if (p21 && n > 22) anchors.push([n - 22, p21]);
  if (p5 && n > 6) anchors.push([n - 6, p5]);
  if (p1 && n > 1) anchors.push([n - 2, p1]);
  anchors.push([n - 1, last]);
  anchors.sort((a, b) => a[0] - b[0]);
  const v = new Array(n);
  for (let k = 0; k < anchors.length - 1; k++) {
    const [i0, a] = anchors[k];
    const [i1, b] = anchors[k + 1];
    for (let i = i0; i <= i1; i++) {
      const f = i1 === i0 ? 0 : (i - i0) / (i1 - i0);
      const noise = i === i0 || i === i1 ? 1 : 1 + (r() - 0.5) * 0.03 * Math.sin(Math.PI * f);
      v[i] = a * Math.pow(b / a, f) * noise;
    }
  }
  return days.map((d, i) => ({ d, v: +v[i].toPrecision(8) }));
}

function yahooJson(sym) {
  let pts;
  let currency = 'USD';
  if (WATCH[sym]) {
    const [last, p1, cur, start] = WATCH[sym];
    currency = cur || 'USD';
    pts = series(sym, last, p1, null, null, null, start);
  } else if (MACRO[sym]) {
    pts = series(sym, ...MACRO[sym]);
  } else if (/^[A-Z]{1,5}$/.test(sym) && sym !== 'BADSYM') {
    pts = series(sym, 100, 99, 98, 95, 90);
  } else {
    return { status: 404, body: { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } } };
  }
  const ts = pts.map((p) => Date.parse(p.d + 'T21:00:00Z') / 1000 - (currency === 'KRW' ? 15 * 3600 : 0));
  return {
    status: 200,
    body: {
      chart: {
        result: [{
          meta: { currency, symbol: sym, regularMarketPrice: pts.at(-1).v, regularMarketTime: ts.at(-1), gmtoffset: currency === 'KRW' ? 32400 : -18000 },
          timestamp: ts,
          indicators: { quote: [{ close: pts.map((p) => p.v) }] },
        }],
        error: null,
      },
    },
  };
}

function fredJson(id) {
  const a = FRED[id];
  if (a === undefined) return { status: 400, body: { error_code: 400, error_message: 'Bad Request. The series does not exist.' } };
  if (a === null) return { status: 200, body: { observations: [] } };
  const pts = series(id, ...a, '2024-09-01');
  return { status: 200, body: { observations: pts.map((p) => ({ date: p.d, value: p.v.toFixed(2) })) } };
}

function fmpJson(path, sym) {
  const B = 1e9;
  if (path === 'shares-float') return { status: 200, body: [{ symbol: sym, date: '2026-11-20 00:00:00', outstandingShares: (sym === 'ORCL' ? 1.2 : sym === 'AAPL' ? 14.48 : 5) * B, floatShares: 0 }] };
  if (path === 'analyst-estimates') {
    if (sym !== 'AAPL') return { status: 403, body: { 'Error Message': 'Premium endpoint for this symbol' } };
    return { status: 200, body: [{ symbol: 'AAPL', date: '2027-09-27', epsAvg: 9.65 }, { symbol: 'AAPL', date: '2028-09-27', epsAvg: 10.7 }, { symbol: 'AAPL', date: '2025-09-27', epsAvg: 7.4 }] };
  }
  if (path === 'income-statement-ttm') {
    if (sym === 'MSFT') return { status: 200, body: [] };
    return { status: 200, body: [{ symbol: sym, date: '2026-09-27', reportedCurrency: 'USD', ebitda: (sym === 'AAPL' ? 174.2 : 20) * B }] };
  }
  if (path === 'cash-flow-statement-ttm') return { status: 200, body: [{ symbol: sym, date: '2026-09-27', reportedCurrency: 'USD', freeCashFlow: (sym === 'AAPL' ? 131.5 : 5) * B }] };
  if (path === 'balance-sheet-statement') return { status: 200, body: [{ symbol: sym, date: '2026-09-27', reportedCurrency: 'USD', netDebt: (sym === 'AAPL' ? -38.1 : 1) * B }] };
  if (path === 'earnings') return { status: 200, body: [{ symbol: sym, date: '2027-01-28', epsActual: null, epsEstimated: 2.6 }, { symbol: sym, date: '2026-10-30', epsActual: 1.9, epsEstimated: 1.8 }] };
  return { status: 404, body: { 'Error Message': 'Unknown endpoint' } };
}

// In-memory Upstash
const kv = new Map();
function redisJson(args) {
  const [c, k, v] = args;
  if (c === 'PING') return { result: 'PONG' };
  if (c === 'GET') return { result: kv.has(k) ? kv.get(k) : null };
  if (c === 'SET') { kv.set(k, v); return { result: 'OK' }; }
  if (c === 'INCRBY') { const n = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(n)); return { result: n }; }
  if (c === 'EXPIRE') return { result: 1 };
  return { error: 'ERR unknown command' };
}

export const calls = [];
const attempts = new Map();

export function installMockFetch({ redis = false } = {}) {
  if (redis) {
    process.env.KV_REST_API_URL = 'https://mock-redis.local';
    process.env.KV_REST_API_TOKEN = 'mock';
  }
  process.env.FMP_API_KEY ||= 'mock-fmp';
  process.env.FRED_API_KEY ||= 'mock-fred';
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    calls.push(u.host + u.pathname);
    const respond = ({ status, body }) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.host === 'mock-redis.local') return respond({ status: 200, body: redisJson(JSON.parse(opts.body)) });
    if (u.host.endsWith('finance.yahoo.com')) {
      const sym = decodeURIComponent(u.pathname.split('/').pop());
      const n = (attempts.get(sym) || 0) + 1;
      attempts.set(sym, n);
      if (sym === '^SKEW') return respond({ status: 429, body: { error: 'Too Many Requests' } });
      if (sym === 'CNY=X' && n % 2 === 1) return respond({ status: 429, body: { error: 'Too Many Requests' } });
      return respond(yahooJson(sym));
    }
    if (u.host === 'api.stlouisfed.org') return respond(fredJson(u.searchParams.get('series_id')));
    if (u.host === 'financialmodelingprep.com') return respond(fmpJson(u.pathname.split('/').pop(), u.searchParams.get('symbol')));
    return real(url, opts);
  };
}
