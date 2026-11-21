// Financial Modeling Prep (free tier: 250 calls/day, end-of-day data).
// Six calls per symbol. Every field is optional: anything missing or refused
// simply falls back to the baseline file.

import { fetchJson } from './http.js';

const BASE = 'https://financialmodelingprep.com/stable';
export const CALLS_PER_SYMBOL = 6;
export const DAILY_LIMIT = 250;
export const SAFETY_LIMIT = 240; // stop a little short of the hard cap

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const first = (j) => (Array.isArray(j) ? j[0] : j && typeof j === 'object' ? j : null);
const bn = (x) => (num(x) === null ? null : x / 1e9);

function url(path, params) {
  const key = process.env.FMP_API_KEY;
  const qs = new URLSearchParams({ ...params, apikey: key }).toString();
  return `${BASE}/${path}?${qs}`;
}

async function call(path, params) {
  try {
    const j = await fetchJson(url(path, params), { retries: 0, timeoutMs: 8000 });
    if (j && !Array.isArray(j) && (j['Error Message'] || j.error)) {
      return { err: String(j['Error Message'] || j.error).slice(0, 120) };
    }
    return { data: j };
  } catch (e) {
    return { err: e.message };
  }
}

/** Pure parser, exported for tests. Takes the six raw responses. */
export function parseFmp(raw, today = new Date().toISOString().slice(0, 10)) {
  const out = { fields: {}, errors: {} };
  const set = (k, v, asOf) => {
    if (v !== null && v !== undefined) out.fields[k] = { v, asOf };
  };

  // Income statement TTM -> EBITDA
  const inc = first(raw.inc?.data);
  if (raw.inc?.err) out.errors.ebitda = raw.inc.err;
  else if (inc) {
    if (inc.reportedCurrency && inc.reportedCurrency !== 'USD') out.errors.ebitda = `Reports in ${inc.reportedCurrency}`;
    else set('ebitda', bn(inc.ebitda), inc.date || null);
  }

  // Cash flow TTM -> FCF
  const cf = first(raw.cf?.data);
  if (raw.cf?.err) out.errors.fcf = raw.cf.err;
  else if (cf) {
    if (cf.reportedCurrency && cf.reportedCurrency !== 'USD') out.errors.fcf = `Reports in ${cf.reportedCurrency}`;
    else {
      const fcf = num(cf.freeCashFlow) ?? (num(cf.operatingCashFlow) !== null && num(cf.capitalExpenditure) !== null ? cf.operatingCashFlow + cf.capitalExpenditure : null);
      set('fcf', bn(fcf), cf.date || null);
    }
  }

  // Latest quarterly balance sheet -> net debt
  const bs = first(raw.bs?.data);
  if (raw.bs?.err) out.errors.netDebt = raw.bs.err;
  else if (bs) {
    if (bs.reportedCurrency && bs.reportedCurrency !== 'USD') out.errors.netDebt = `Reports in ${bs.reportedCurrency}`;
    else {
      let nd = num(bs.netDebt);
      if (nd === null && num(bs.totalDebt) !== null) {
        const cash = num(bs.cashAndShortTermInvestments) ?? num(bs.cashAndCashEquivalents) ?? 0;
        nd = bs.totalDebt - cash;
      }
      set('netDebt', bn(nd), bs.date || null);
    }
  }

  // Shares outstanding
  const sf = first(raw.sf?.data);
  if (raw.sf?.err) out.errors.shares = raw.sf.err;
  else if (sf) set('shares', bn(num(sf.outstandingShares)), (sf.date || '').slice(0, 10) || today);

  // Analyst estimates (annual) -> next fiscal year EPS consensus
  if (raw.est?.err) out.errors.fwdEps = raw.est.err;
  else if (Array.isArray(raw.est?.data)) {
    const fut = raw.est.data
      .filter((e) => e && e.date && e.date > today && num(e.epsAvg) !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (fut.length) set('fwdEps', fut[0].epsAvg, today);
  }

  // Earnings history/calendar -> last & next report dates
  if (raw.earn?.err) out.errors.earnings = raw.earn.err;
  else if (Array.isArray(raw.earn?.data)) {
    const rows = raw.earn.data.filter((e) => e && e.date);
    const past = rows.filter((e) => e.date <= today && e.epsActual !== null && e.epsActual !== undefined).sort((a, b) => (a.date < b.date ? 1 : -1));
    const next = rows.filter((e) => e.date > today).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (past.length) set('lastEarnings', past[0].date, today);
    if (next.length) set('nextEarnings', next[0].date, today);
  }
  return out;
}

/** Fetch and parse FMP fundamentals for one symbol. Returns {fields, errors, calls}. */
export async function getFundamentals(symbol) {
  const s = { symbol };
  const [inc, cf, bs, sf, est, earn] = await Promise.all([
    call('income-statement-ttm', s),
    call('cash-flow-statement-ttm', s),
    call('balance-sheet-statement', { ...s, period: 'quarter', limit: '1' }),
    call('shares-float', s),
    call('analyst-estimates', { ...s, period: 'annual', page: '0', limit: '10' }),
    call('earnings', { ...s, limit: '12' }),
  ]);
  const parsed = parseFmp({ inc, cf, bs, sf, est, earn });
  return { ...parsed, calls: CALLS_PER_SYMBOL, fetchedAt: new Date().toISOString() };
}
