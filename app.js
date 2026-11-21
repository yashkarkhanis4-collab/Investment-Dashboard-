import { computeRow, macroSignals, macroChanges, NM, STALE_DAYS, daysBetween } from './calc.js';

// ---------------------------------------------------------------------------
// Local storage
// ---------------------------------------------------------------------------
const K = {
  pass: 'lsdash.pass',
  state: 'lsdash.state',
  prices: 'lsdash.prices',
  fund: 'lsdash.fund',
  theme: 'lsdash.theme',
  tab: 'lsdash.tab',
  sort: 'lsdash.sort',
  fmpLocal: 'lsdash.fmpLocal',
};
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full or disabled */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
const S = {
  pass: store.get(K.pass) || '',
  state: store.get(K.state) || null,
  sync: false,
  syncError: null,
  prices: store.get(K.prices) || null,
  pricesFromCache: true,
  fund: store.get(K.fund) || null,
  tab: store.get(K.tab) || 'watch',
  sort: store.get(K.sort) || { key: 'mktCap', dir: -1 },
  expanded: new Set(),
  refreshing: false,
  editing: null,
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const F = {
  price: (v) => (isNum(v) ? '$' + nf(2).format(v) : '–'),
  local: (v, cur) => (isNum(v) ? `${cur === 'KRW' ? '₩' : cur + ' '}${nf(cur === 'KRW' || cur === 'JPY' ? 0 : 2).format(v)}` : ''),
  bn: (v) => (isNum(v) ? nf(1).format(v) : '–'),
  mult: (v) => (v === NM ? NM : isNum(v) ? nf(1).format(v) : '–'),
  x: (v) => (v === NM ? NM : isNum(v) ? nf(2).format(v) + 'x' : '–'),
  pct: (v, d = 1) => (isNum(v) ? nf(d).format(v * 100) + '%' : '–'),
  spct: (v, d = 1) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v * 100)) + '%' : '–'),
  bp: (v) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(0).format(Math.abs(v)) + 'bp' : '–'),
  num: (v, d = 2) => (isNum(v) ? nf(d).format(v) : '–'),
  date: (s) => {
    if (!s) return '–';
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
  },
  sgt: (iso) =>
    iso
      ? new Date(iso).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' SGT'
      : '',
};
const arrow = (v) => (isNum(v) ? (v > 0 ? '▲' : v < 0 ? '▼' : '•') : '');
const dirCls = (v) => (isNum(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '');

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
class AuthError extends Error {}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-dash-pass': S.pass || '' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) throw new AuthError('Passcode required');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function handleErr(e, ctx) {
  if (e instanceof AuthError) return showLock('Passcode changed or missing - please re-enter.');
  console.error(ctx, e);
  toast(`${ctx}: ${e.message}`);
}

// ---------------------------------------------------------------------------
// Passcode
// ---------------------------------------------------------------------------
function showLock(msg = '') {
  $('#app').hidden = true;
  $('#lock').hidden = false;
  $('#lock-error').textContent = msg;
  setTimeout(() => $('#lock-input').focus(), 50);
}

$('#lock-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pass = $('#lock-input').value;
  $('#lock-error').textContent = '';
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass }) });
    if (!r.ok) throw new Error('Incorrect passcode');
    S.pass = pass;
    store.set(K.pass, pass);
    $('#lock').hidden = true;
    start();
  } catch (e) {
    $('#lock-error').textContent = e.message;
  }
});

// ---------------------------------------------------------------------------
// Theme / tabs
// ---------------------------------------------------------------------------
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === (t || 'auto')));
}
$$('.seg-btn').forEach((b) =>
  b.addEventListener('click', () => {
    store.set(K.theme, b.dataset.theme);
    applyTheme(b.dataset.theme);
  })
);

function setTab(t) {
  S.tab = t;
  store.set(K.tab, t);
  $('#view-watch').hidden = t !== 'watch';
  $('#view-macro').hidden = t !== 'macro';
  $$('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  window.scrollTo({ top: 0 });
}
$$('.tab[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------------------------------------------------------------------------
// Watchlist state (tickers + edits), synced via /api/state when Redis exists
// ---------------------------------------------------------------------------
let saveTimer;
function saveState() {
  S.state.updatedAt = new Date().toISOString();
  store.set(K.state, S.state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await api('/api/state', { method: 'PUT', body: { state: S.state } });
      S.sync = !!r.sync && r.ok !== false;
    } catch (e) {
      if (e instanceof AuthError) return handleErr(e, 'Save');
      S.sync = false;
      S.syncError = e.message;
    }
    renderBadge();
  }, 500);
}

async function loadState() {
  try {
    const r = await api('/api/state');
    S.sync = !!r.sync;
    S.syncError = r.error || null;
    if (r.sync) {
      if (r.isDefault && S.state && S.state.tickers?.length) {
        // First time sync is switched on: push what this device already has.
        saveState();
      } else {
        S.state = r.state;
        store.set(K.state, S.state);
      }
    } else if (!S.state) {
      S.state = r.state; // server default watchlist
      store.set(K.state, S.state);
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    S.syncError = e.message;
    if (!S.state) S.state = { version: 1, tickers: [], edits: {} };
  }
  renderBadge();
}

function renderBadge() {
  const b = $('#sync-badge');
  if (S.sync) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.textContent = 'Not syncing';
  b.title = S.syncError
    ? `Sync error: ${S.syncError}. Edits are saved on this device only.`
    : 'No Redis database connected in Vercel. Edits are saved on this device only.';
}

const edit = (sym) => (S.state.edits[sym] ||= { ls: 'Watch', thesis: '' });

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
function symbols() {
  return (S.state?.tickers || []).map((t) => t.symbol);
}

async function refreshPrices() {
  if (S.refreshing) return;
  S.refreshing = true;
  const btn = $('#btn-refresh');
  btn.classList.add('loading');
  btn.disabled = true;
  try {
    const p = await api('/api/prices?symbols=' + encodeURIComponent(symbols().join(',')));
    S.prices = p;
    S.pricesFromCache = false;
    store.set(K.prices, p);
    if (p.failed) toast(`${p.failed} item${p.failed > 1 ? 's' : ''} failed to load - marked in the table`);
  } catch (e) {
    handleErr(e, 'Refresh failed');
  } finally {
    S.refreshing = false;
    btn.classList.remove('loading');
    btn.disabled = false;
    render();
  }
}

async function loadFundamentals() {
  try {
    const r = await api('/api/fundamentals?symbols=' + encodeURIComponent(symbols().join(',')));
    // Without Redis the server can't cache FMP results; keep the richer local copy.
    const local = store.get(K.fund);
    if (!r.fmp?.sync && local?.fromFmp && local.fundamentals) {
      S.fund = { ...local, fmp: r.fmp };
      for (const s of symbols()) if (!S.fund.fundamentals[s]) S.fund.fundamentals[s] = r.fundamentals[s];
    } else {
      S.fund = r;
      store.set(K.fund, r);
    }
  } catch (e) {
    handleErr(e, 'Fundamentals');
  }
  render();
}

async function updateFundamentals() {
  const btn = $('#btn-fund');
  const out = $('#fund-result');
  const fmp = S.fund?.fmp || {};
  const local = store.get(K.fmpLocal) || {};
  const today = todayISO();
  const clientCalls = local.date === today ? local.calls || 0 : 0;
  if (!fmp.sync && local.lastRun && Date.now() - Date.parse(local.lastRun) < 20 * 3600e3) {
    if (!confirm('Fundamentals were updated less than 20h ago on this device. Without Redis every update uses fresh FMP calls. Run anyway?')) return;
  }
  btn.disabled = true;
  btn.textContent = 'Updating…';
  out.textContent = '';
  try {
    const r = await api('/api/fundamentals', { method: 'POST', body: { symbols: symbols(), clientCallsToday: clientCalls } });
    S.fund = { ...r, fromFmp: true };
    store.set(K.fund, S.fund);
    const made = r.summary?.callsMade || 0;
    store.set(K.fmpLocal, { date: today, calls: clientCalls + made, lastRun: new Date().toISOString() });
    const sm = r.summary || {};
    const failed = Object.entries(sm.failed || {});
    out.innerHTML =
      `<div class="up">Updated ${sm.updated?.length || 0} name(s), ${made} FMP calls.</div>` +
      (failed.length ? `<div class="down">Failed: ${failed.map(([s, m]) => `${esc(s)} (${esc(m)})`).join('; ')}</div>` : '') +
      (sm.skipped?.length ? `<div class="muted">Skipped ${sm.skipped.length}: ${esc([...new Set(sm.skipped.map((x) => x.reason))].join('; '))}</div>` : '');
    render();
  } catch (e) {
    if (e instanceof AuthError) return handleErr(e, 'Fundamentals');
    out.innerHTML = `<div class="down">${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update';
    renderFmpMeta();
  }
}

function renderFmpMeta() {
  const f = S.fund?.fmp;
  const el = $('#fmp-meta');
  if (!f) return (el.textContent = '');
  if (!f.keySet) return (el.textContent = 'FMP_API_KEY not set in Vercel - showing baseline fundamentals.');
  const local = store.get(K.fmpLocal) || {};
  const used = f.callsToday ?? (local.date === todayISO() ? local.calls : 0) ?? 0;
  const left = Math.max(0, f.dailyLimit - used);
  el.textContent = `${used} of ${f.dailyLimit} free calls used today (${left} left; ~${f.callsPerSymbol} per name).` + (f.sync ? '' : ' Count is per device (no Redis).');
}

async function runHealth() {
  const out = $('#health-result');
  out.textContent = 'Checking…';
  try {
    const h = await api('/api/health');
    const env = h.env || {};
    const envLine = Object.entries(env)
      .map(([k, v]) => `<span class="chip ${v ? '' : 'amber'}">${esc(k)} ${v ? '✓' : '✗'}</span>`)
      .join('');
    const src = h.sources || {};
    const items = Object.entries(src)
      .map(
        ([k, r]) =>
          `<li><span class="${r.ok ? 'ok-dot' : 'bad-dot'}"></span><div><b>${esc(k)}</b> ${r.ok ? `ok · ${r.ms}ms` : 'failed'}<div class="muted">${esc(r.ok ? r.detail : (r.status ? `[${r.status}] ` : '') + r.error)}</div></div></li>`
      )
      .join('');
    out.innerHTML = `<div style="margin-top:8px">${envLine}</div><ul class="health-list">${items}</ul>`;
  } catch (e) {
    if (e instanceof AuthError) return handleErr(e, 'Status');
    out.innerHTML = `<div class="down">${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Watchlist rendering
// ---------------------------------------------------------------------------
function fundField(sym, k) {
  return S.fund?.fundamentals?.[sym]?.fields?.[k] || null;
}

function buildRows() {
  const quotes = S.prices?.quotes || {};
  const fx = S.prices?.fx || {};
  const spx = (S.prices?.macro || []).flatMap((g) => g.items).find((i) => i.id === 'spx');
  const today = todayISO();
  return (S.state?.tickers || []).map((t) => {
    const sym = t.symbol;
    const q = quotes[sym];
    const f = S.fund?.fundamentals?.[sym];
    const r = q ? computeRow(q, f, fx, spx && !spx.error ? spx : null) : { errors: S.prices ? ['Not loaded yet - press Refresh'] : [], flags: [] };
    const e = S.state.edits[sym] || {};
    const baseCat = fundField(sym, 'catalyst')?.v || '';
    const nextE = fundField(sym, 'nextEarnings');
    const stale = [];
    if (q && !q.error) {
      const age = daysBetween(q.asOf, today);
      if (age !== null && age > STALE_DAYS.price) stale.push(`Price ${age}d old`);
      if (q.flat) stale.push('Price unchanged 1D & 1W');
    }
    return {
      sym,
      label: t.label || '',
      industry: t.industry || '',
      ls: e.ls || 'Watch',
      thesis: e.thesis || '',
      catalyst: e.catalyst !== undefined && e.catalyst !== null ? e.catalyst : baseCat,
      catalystEdited: e.catalyst !== undefined && e.catalyst !== null,
      nextEarnings: nextE?.v || null,
      q,
      f,
      r,
      stale,
      note: f?.note || null,
      fmpErrors: f?.fmpErrors || null,
    };
  });
}

/** Column spec. `get` returns the sortable value; `cell` returns {html, cls, title}. */
function fieldMeta(row, key) {
  const f = fundField(row.sym, key);
  if (!f) return { title: '', old: false };
  const age = daysBetween(f.asOf, todayISO());
  const lim = key === 'shortFloat' || key === 'dtc' ? STALE_DAYS.shortInterest : STALE_DAYS.fundamentals;
  return { title: `${f.src} · as of ${F.date(f.asOf)}${age > lim ? ' · STALE' : ''}`, old: age !== null && age > lim };
}
const metaFor = { mktCap: 'shares', ev: 'netDebt', fwdPE: 'fwdEps', evEbitda: 'ebitda', fcfYield: 'fcf', netLev: 'ebitda', shortFloat: 'shortFloat', dtc: 'dtc', beta: 'beta', lastEarnings: 'lastEarnings' };

const COLS = [
  { key: 'sym', label: 'Ticker', cls: 'sticky-1', get: (r) => r.sym },
  { key: 'industry', label: 'Industry', cls: 'sticky-2', get: (r) => r.industry },
  { key: 'ls', label: 'L/S', get: (r) => r.ls },
  { key: 'priceUSD', label: 'Price', n: true, get: (r) => r.r.priceUSD },
  { key: 'chg1d', label: '1D', n: true, get: (r) => r.r.chg1d },
  { key: 'mktCap', label: 'Mkt Cap $bn', n: true, get: (r) => r.r.mktCap },
  { key: 'ev', label: 'EV $bn', n: true, get: (r) => r.r.ev },
  { key: 'fwdPE', label: 'Fwd P/E', n: true, get: (r) => r.r.fwdPE },
  { key: 'evEbitda', label: 'EV/EBITDA', n: true, get: (r) => r.r.evEbitda },
  { key: 'fcfYield', label: 'FCF Yld', n: true, get: (r) => r.r.fcfYield },
  { key: 'netLev', label: 'ND/EBITDA', n: true, get: (r) => r.r.netLev },
  { key: 'shortFloat', label: 'SI % Float', n: true, get: (r) => r.r.shortFloat },
  { key: 'dtc', label: 'DTC', n: true, get: (r) => r.r.dtc },
  { key: 'beta', label: 'Beta', n: true, get: (r) => r.r.beta },
  { key: 'chg52w', label: '52w', n: true, get: (r) => r.r.chg52w },
  { key: 'offHigh', label: 'Off High', n: true, get: (r) => r.r.offHigh },
  { key: 'relPerf3m', label: 'Rel 3M vs SPX', n: true, get: (r) => r.r.relPerf3m },
  { key: 'lastEarnings', label: 'Last Earn', get: (r) => r.r.lastEarnings || '' },
  { key: 'catalyst', label: 'Next Catalyst', get: (r) => r.catalyst },
  { key: 'thesis', label: 'Thesis', get: (r) => r.thesis },
];

function sortRows(rows) {
  const col = COLS.find((c) => c.key === S.sort.key) || COLS[5];
  const dir = S.sort.dir;
  return [...rows].sort((a, b) => {
    const va = col.get(a);
    const vb = col.get(b);
    const na = va === null || va === undefined || va === '' || va === NM;
    const nb = vb === null || vb === undefined || vb === '' || vb === NM;
    if (na && nb) return a.sym.localeCompare(b.sym);
    if (na) return 1; // blanks and n.m. always last
    if (nb) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

function numCell(row, key, text, extraCls = '') {
  const m = metaFor[key] ? fieldMeta(row, metaFor[key]) : { title: '', old: false };
  return `<td class="n ${extraCls} ${m.old ? 'old' : ''}" title="${esc(m.title)}">${text}</td>`;
}

function flagCls(row, key) {
  const fl = row.r.flags || [];
  const map = { fcfYield: 'fcf', netLev: 'lev', shortFloat: 'si', dtc: 'dtc' };
  const hit = fl.find((f) => f.key === map[key]);
  return hit ? `cell-${hit.level}` : '';
}

function renderTable(rows) {
  const head = COLS.map((c) => {
    const sorted = S.sort.key === c.key;
    return `<th data-key="${c.key}" class="${c.cls || ''} ${c.n ? 'n' : ''} ${sorted ? 'sorted' : ''}">${esc(c.label)}${sorted ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  }).join('');
  const body = rows
    .map((row) => {
      const r = row.r;
      const err = r.errors?.length ? r.errors.join('; ') : '';
      const chips =
        (err ? `<span class="chip err" title="${esc(err)}">⚠ ${esc(err.length > 28 ? err.slice(0, 26) + '…' : err)}</span>` : '') +
        row.stale.map((s) => `<span class="chip amber" title="${esc(s)}">⏱ stale</span>`).join('') +
        (row.note ? `<span class="chip" title="${esc(row.note)}">ⓘ note</span>` : '');
      const localPx = r.currency && r.currency !== 'USD' ? `<span class="sub-local">${esc(F.local(r.priceLocal, r.currency))}</span>` : '';
      const asOf = row.q?.asOf ? `Price as of ${F.date(row.q.asOf)}` : '';
      return `<tr class="${err ? 'row-err' : ''}" data-sym="${esc(row.sym)}">
        <td class="sticky-1"><span class="sym" data-edit="${esc(row.sym)}">${esc(row.sym)}${row.label ? `<span class="sub">${esc(row.label)}</span>` : ''}</span>${chips ? `<div>${chips}</div>` : ''}</td>
        <td class="sticky-2 ind">${esc(row.industry)}</td>
        <td><select class="ls-sel ${esc(row.ls)}" data-ls="${esc(row.sym)}" aria-label="L/S for ${esc(row.sym)}">${['Watch', 'Long', 'Short'].map((o) => `<option ${o === row.ls ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td class="n" title="${esc(asOf)}">${F.price(r.priceUSD)}${localPx}</td>
        <td class="n ${dirCls(r.chg1d)}">${arrow(r.chg1d)} ${F.spct(r.chg1d)}</td>
        ${numCell(row, 'mktCap', F.bn(r.mktCap))}
        ${numCell(row, 'ev', F.bn(r.ev))}
        ${numCell(row, 'fwdPE', F.mult(r.fwdPE))}
        ${numCell(row, 'evEbitda', F.mult(r.evEbitda))}
        ${numCell(row, 'fcfYield', F.pct(r.fcfYield), flagCls(row, 'fcfYield'))}
        ${numCell(row, 'netLev', F.x(r.netLev), flagCls(row, 'netLev'))}
        ${numCell(row, 'shortFloat', F.pct(r.shortFloat), flagCls(row, 'shortFloat'))}
        ${numCell(row, 'dtc', F.num(r.dtc, 1), flagCls(row, 'dtc'))}
        ${numCell(row, 'beta', F.num(r.beta, 2))}
        <td class="n ${dirCls(r.chg52w)}">${F.spct(r.chg52w)}</td>
        <td class="n">${F.spct(r.offHigh)}</td>
        <td class="n ${dirCls(r.relPerf3m)}">${arrow(r.relPerf3m)} ${F.spct(r.relPerf3m)}</td>
        ${numCell(row, 'lastEarnings', F.date(r.lastEarnings))}
        <td class="txt" data-edit="${esc(row.sym)}" title="${row.catalystEdited ? 'Your note' : 'From baseline - click to edit'}">${row.catalyst ? esc(row.catalyst) : '<span class="ph">Add…</span>'}${row.nextEarnings ? `<div class="muted small">Next earnings (FMP): ${F.date(row.nextEarnings)}</div>` : ''}</td>
        <td class="txt" data-edit="${esc(row.sym)}">${row.thesis ? esc(row.thesis) : '<span class="ph">Add thesis…</span>'}</td>
      </tr>`;
    })
    .join('');
  $('#watch-table').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

function kv(label, value, meta) {
  return `<div class="k">${esc(label)}</div><div class="v">${value}${meta?.title ? `<small>${esc(meta.title)}</small>` : ''}</div>`;
}

function renderCards(rows) {
  $('#watch-cards').innerHTML = rows
    .map((row) => {
      const r = row.r;
      const open = S.expanded.has(row.sym);
      const err = r.errors?.length ? r.errors.join('; ') : '';
      const flagChips = (r.flags || []).map((f) => `<span class="chip ${f.level}">${esc(f.label)}</span>`).join('');
      const staleChips = row.stale.map((s) => `<span class="chip amber">⏱ ${esc(s)}</span>`).join('');
      const errChip = err ? `<span class="chip err">⚠ ${esc(err)}</span>` : '';
      const localPx = r.currency && r.currency !== 'USD' ? `<div class="muted small">${esc(F.local(r.priceLocal, r.currency))}</div>` : '';
      const m = (k) => fieldMeta(row, metaFor[k] || k);
      const more = open
        ? `<div class="card-more">
            <div class="kv">
              ${kv('Mkt cap ($bn)', F.bn(r.mktCap), m('mktCap'))}
              ${kv('EV ($bn)', F.bn(r.ev), m('ev'))}
              ${kv('Fwd P/E', F.mult(r.fwdPE), m('fwdPE'))}
              ${kv('EV/EBITDA (LTM)', F.mult(r.evEbitda), m('evEbitda'))}
              ${kv('FCF yield', F.pct(r.fcfYield), m('fcfYield'))}
              ${kv('Net debt / EBITDA', F.x(r.netLev), m('netLev'))}
              ${kv('Short % float', F.pct(r.shortFloat), m('shortFloat'))}
              ${kv('Days to cover', F.num(r.dtc, 1), m('dtc'))}
              ${kv('Beta (5Y)', F.num(r.beta, 2), m('beta'))}
              ${kv('52w change', `<span class="${dirCls(r.chg52w)}">${F.spct(r.chg52w)}</span>`)}
              ${kv('Off 52w high', F.spct(r.offHigh))}
              ${kv('Rel perf 3M vs S&P', `<span class="${dirCls(r.relPerf3m)}">${arrow(r.relPerf3m)} ${F.spct(r.relPerf3m)}</span>`)}
              ${kv('Last earnings', F.date(r.lastEarnings), m('lastEarnings'))}
              ${row.nextEarnings ? kv('Next earnings (FMP)', F.date(row.nextEarnings)) : ''}
              ${kv('Price as of', F.date(row.q?.asOf))}
            </div>
            <div class="card-text"><span class="lbl">Next catalyst</span>${row.catalyst ? esc(row.catalyst) : '<span class="muted">–</span>'}</div>
            <div class="card-text"><span class="lbl">Thesis</span>${row.thesis ? esc(row.thesis) : '<span class="muted">No thesis yet</span>'}</div>
            ${row.note ? `<div class="card-note">ⓘ ${esc(row.note)}</div>` : ''}
            <div class="card-actions"><button class="btn sm" data-edit="${esc(row.sym)}">Edit</button></div>
          </div>`
        : '';
      return `<article class="card" data-sym="${esc(row.sym)}">
        <div class="card-top" data-toggle="${esc(row.sym)}">
          <div class="card-id">
            <div class="t">${esc(row.sym)} ${row.label ? `<span class="muted small">${esc(row.label)}</span>` : ''} <span class="pill ${esc(row.ls)}">${esc(row.ls)}</span></div>
            <div class="i">${esc(row.industry)}</div>
          </div>
          <div class="card-px">
            <div class="p">${F.price(r.priceUSD)}</div>
            <div class="c ${dirCls(r.chg1d)}">${arrow(r.chg1d)} ${F.spct(r.chg1d)}</div>
            ${localPx}
          </div>
        </div>
        <div class="card-kpis">
          <span>Fwd P/E <b>${F.mult(r.fwdPE)}</b></span>
          <span>ND/EBITDA <b>${F.x(r.netLev)}</b></span>
          <span>Mkt cap <b>${F.bn(r.mktCap)}</b></span>
        </div>
        ${flagChips || staleChips || errChip ? `<div>${errChip}${flagChips}${staleChips}</div>` : ''}
        ${more}
      </article>`;
    })
    .join('');
}

function renderSortSelect() {
  const sel = $('#sort-select');
  if (!sel.options.length) {
    sel.innerHTML = COLS.filter((c) => !['industry', 'thesis', 'catalyst'].includes(c.key))
      .map((c) => `<option value="${c.key}">${esc(c.label)}</option>`)
      .join('');
  }
  sel.value = S.sort.key;
  $('#sort-dir').textContent = S.sort.dir > 0 ? '↑' : '↓';
}

function renderWatch() {
  const rows = sortRows(buildRows());
  renderTable(rows);
  renderCards(rows);
  renderSortSelect();
  const flagged = rows.filter((r) => r.r.flags?.length).length;
  const errs = rows.filter((r) => r.r.errors?.length).length;
  const ls = rows.reduce((a, r) => ((a[r.ls] = (a[r.ls] || 0) + 1), a), {});
  $('#watch-summary').textContent =
    `${rows.length} names · ${ls.Long || 0} long · ${ls.Short || 0} short · ${flagged} flagged` + (errs ? ` · ${errs} with errors` : '');
}

// ---------------------------------------------------------------------------
// Macro rendering
// ---------------------------------------------------------------------------
function fmtLevel(it) {
  if (!isNum(it.last)) return '–';
  if (it.unit === 'yield') return nf(2).format(it.last) + '%';
  if (it.unit === 'spread') return nf(0).format(it.last * 100) + 'bp';
  if (it.unit === 'ratio') return nf(3).format(it.last);
  return nf(it.last >= 1000 ? 2 : it.last < 10 ? 4 : 2).format(it.last);
}
function fmtHL(it, v) {
  return fmtLevel({ ...it, last: v });
}
function chgCell(v, bp) {
  const t = bp ? F.bp(v) : F.spct(v);
  return `<td class="n ${dirCls(v)}">${isNum(v) ? arrow(v) + ' ' : ''}${t}</td>`;
}

function renderMacro() {
  const macro = S.prices?.macro || [];
  $('#signals').innerHTML = macroSignals(macro)
    .map((s) => {
      const v = s.fmt === 'bp' ? F.bp(s.value) : s.fmt === 'pct' ? F.spct(s.value) : isNum(s.value) ? nf(2).format(s.value) : '–';
      const sub = isNum(s.sub) ? `<div class="s">${s.subLabel === 'level' ? 'Level ' + nf(0).format(s.sub) + 'bp' : '1M ' + F.bp(s.sub)}</div>` : '';
      // Signal values are coloured by meaning (alert = red), not by sign:
      // e.g. spreads widening is a positive number but bad news.
      return `<div class="signal ${s.alert ? 'alert' : ''}"><div class="l">${esc(s.label)}</div><div class="v ${s.alert ? 'down' : ''}">${s.alert ? '⚠ ' : ''}${v}</div>${sub}<div class="r">${esc(s.read)}</div></div>`;
    })
    .join('');
  const today = todayISO();
  $('#macro-groups').innerHTML = macro
    .map((g) => {
      const rows = g.items
        .map((it) => {
          if (it.error) return `<tr><td class="name">${esc(it.name)}<span class="sym2">${esc(it.symbol || '')}</span></td><td colspan="10" class="down">⚠ ${esc(it.error)}</td></tr>`;
          const c = macroChanges(it);
          const age = daysBetween(it.asOf, today);
          const stale = (age !== null && age > STALE_DAYS.macro) || it.flat;
          return `<tr>
            <td class="name">${esc(it.name)}<span class="sym2">${esc(it.symbol || '')}${stale ? ' · <span class="chip amber">⏱ stale</span>' : ''}</span></td>
            <td class="n">${fmtLevel(it)}</td>
            ${chgCell(c.c1d, c.bp)}${chgCell(c.c1w, c.bp)}${chgCell(c.c1m, c.bp)}${chgCell(c.ytd, c.bp)}
            ${chgCell(c.offHigh, c.bp)}${chgCell(c.vsMa, c.bp)}
            <td class="n">${fmtHL(it, it.hi52)}</td><td class="n">${fmtHL(it, it.lo52)}</td>
            <td class="n muted">${F.date(it.asOf)}</td>
          </tr>`;
        })
        .join('');
      return `<details class="group" open><summary><span>${esc(g.group)} <span class="hint mobile-only">· swipe table for more →</span></span></summary><div class="macro-wrap"><table class="macro">
        <thead><tr><th class="name">Instrument</th><th class="n">Level</th><th class="n">1D</th><th class="n">1W</th><th class="n">1M</th><th class="n">YTD</th><th class="n">Off 52w Hi</th><th class="n">vs 200DMA</th><th class="n">52w High</th><th class="n">52w Low</th><th class="n">As of</th></tr></thead>
        <tbody>${rows}</tbody></table></div></details>`;
    })
    .join('');
  if (!macro.length) $('#macro-groups').innerHTML = '<p class="muted">Press Refresh to load macro data.</p>';
}

// ---------------------------------------------------------------------------
// Header / banner
// ---------------------------------------------------------------------------
function renderHeader() {
  const p = S.prices;
  $('#updated').textContent = p ? `Updated ${F.sgt(p.generatedAt)}` : 'Not loaded';
  const b = $('#banner');
  if (p && S.pricesFromCache) {
    b.hidden = false;
    b.className = 'banner';
    b.textContent = `Showing saved data from ${F.sgt(p.generatedAt)} - ${S.refreshing ? 'refreshing…' : 'press Refresh for live prices.'}`;
  } else b.hidden = true;
}

function render() {
  if (!S.state) return;
  renderHeader();
  renderWatch();
  renderMacro();
  renderFmpMeta();
  renderBadge();
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
$('#btn-refresh').addEventListener('click', () => {
  refreshPrices().then(renderHeader);
  renderHeader();
});
const openMenu = () => {
  renderFmpMeta();
  applyTheme(store.get(K.theme) || 'auto');
  $('#menu').showModal();
};
$('#btn-menu').addEventListener('click', openMenu);
$('#bt-menu').addEventListener('click', openMenu);
$('#btn-fund').addEventListener('click', updateFundamentals);
$('#btn-health').addEventListener('click', runHealth);
$('#btn-lock').addEventListener('click', () => {
  store.del(K.pass);
  S.pass = '';
  $('#menu').close();
  showLock('Locked on this device.');
});

$('#watch-table').addEventListener('click', (ev) => {
  const th = ev.target.closest('th[data-key]');
  if (th) {
    const k = th.dataset.key;
    S.sort = S.sort.key === k ? { key: k, dir: -S.sort.dir } : { key: k, dir: ['sym', 'industry', 'ls', 'catalyst', 'thesis', 'lastEarnings'].includes(k) ? 1 : -1 };
    store.set(K.sort, S.sort);
    return renderWatch();
  }
  const ed = ev.target.closest('[data-edit]');
  if (ed) openEditor(ed.dataset.edit);
});
$('#watch-table').addEventListener('change', (ev) => {
  const sel = ev.target.closest('select[data-ls]');
  if (!sel) return;
  edit(sel.dataset.ls).ls = sel.value;
  saveState();
  renderWatch();
});
$('#watch-cards').addEventListener('click', (ev) => {
  const ed = ev.target.closest('[data-edit]');
  if (ed) return openEditor(ed.dataset.edit);
  const tg = ev.target.closest('[data-toggle]');
  if (tg) {
    const s = tg.dataset.toggle;
    S.expanded.has(s) ? S.expanded.delete(s) : S.expanded.add(s);
    renderWatch();
  }
});
$('#sort-select').addEventListener('change', (ev) => {
  S.sort = { key: ev.target.value, dir: S.sort.dir };
  store.set(K.sort, S.sort);
  renderWatch();
});
$('#sort-dir').addEventListener('click', () => {
  S.sort = { ...S.sort, dir: -S.sort.dir };
  store.set(K.sort, S.sort);
  renderWatch();
});

// Editor
function openEditor(sym) {
  const t = S.state.tickers.find((x) => x.symbol === sym);
  if (!t) return;
  S.editing = sym;
  const e = S.state.edits[sym] || {};
  const base = fundField(sym, 'catalyst')?.v || '';
  $('#ed-title').textContent = `${sym}${t.label ? ' · ' + t.label : ''}`;
  $('#ed-ls').value = e.ls || 'Watch';
  $('#ed-industry').value = t.industry || '';
  $('#ed-catalyst').value = e.catalyst ?? base;
  $('#ed-catalyst-hint').textContent = base && e.catalyst === undefined ? 'Showing baseline catalyst - edit to replace.' : '';
  $('#ed-thesis').value = e.thesis || '';
  $('#editor').showModal();
}
$('#editor').addEventListener('close', () => {
  const sym = S.editing;
  S.editing = null;
  if ($('#editor').returnValue !== 'save' || !sym) return;
  const t = S.state.tickers.find((x) => x.symbol === sym);
  const e = edit(sym);
  e.ls = $('#ed-ls').value;
  e.thesis = $('#ed-thesis').value.trim();
  const cat = $('#ed-catalyst').value.trim();
  const base = fundField(sym, 'catalyst')?.v || '';
  if (cat !== base || e.catalyst !== undefined) e.catalyst = cat;
  if (t) t.industry = $('#ed-industry').value.trim();
  saveState();
  renderWatch();
  toast(`${sym} saved${S.sync ? '' : ' on this device'}`);
});
$('#ed-remove').addEventListener('click', () => {
  const sym = S.editing;
  if (!sym || !confirm(`Remove ${sym} from the watchlist? Your thesis for it will be deleted.`)) return;
  S.state.tickers = S.state.tickers.filter((x) => x.symbol !== sym);
  delete S.state.edits[sym];
  $('#editor').close('removed');
  saveState();
  renderWatch();
  toast(`${sym} removed`);
});

// Add ticker
$('#btn-add').addEventListener('click', () => {
  $('#add-symbol').value = '';
  $('#add-industry').value = '';
  $('#adder').showModal();
});
$('#adder').addEventListener('close', async () => {
  if ($('#adder').returnValue !== 'add') return;
  const sym = $('#add-symbol').value.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(sym)) return toast('That symbol format is not valid');
  if (S.state.tickers.some((t) => t.symbol === sym)) return toast(`${sym} is already on the list`);
  S.state.tickers.push({ symbol: sym, industry: $('#add-industry').value.trim() });
  saveState();
  render();
  toast(`${sym} added - loading prices…`);
  await refreshPrices();
  loadFundamentals();
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3200);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function start() {
  $('#app').hidden = false;
  setTab(S.tab);
  if (S.state) render(); // instant paint from this device's saved copy
  try {
    await loadState();
  } catch (e) {
    return handleErr(e, 'Load');
  }
  render();
  await Promise.all([refreshPrices(), loadFundamentals()]);
}

async function boot() {
  applyTheme(store.get(K.theme) || 'auto');
  let required = false;
  try {
    required = (await fetch('/api/auth').then((r) => r.json())).required;
  } catch {
    /* offline - fall through and use cached data */
  }
  if (required && !S.pass) return showLock();
  start();
}

// Refresh when the app comes back to the foreground after a while (phone).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.prices && Date.now() - Date.parse(S.prices.generatedAt) > 10 * 60e3) refreshPrices();
});

boot();
