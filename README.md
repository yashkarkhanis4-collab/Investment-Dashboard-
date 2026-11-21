# L/S Research Dashboard

Personal long/short research dashboard: a 19-name watchlist with valuation, leverage and positioning flags, plus a macro monitor (indices, vol, rates, credit spreads, FX, commodities, ratios). One tap refreshes everything. Works on desktop and as a home-screen app on your phone.

**To deploy, follow [DEPLOY.md](DEPLOY.md).**

## How it works

```
public/           Static front end (no build step)
  index.html      Layout, dialogs
  app.js          UI: tables/cards, editing, refresh, passcode
  calc.js         All watchlist maths (unit-tested)
  styles.css      Dark/light, desktop table <-> phone cards at 768px
api/              Vercel serverless functions
  prices.js       GET  watchlist + macro prices & stats (Yahoo + FRED)
  fundamentals.js GET  baseline + cached FMP;  POST fetch fresh FMP (budgeted)
  state.js        GET/PUT your watchlist, L/S flags, theses, catalysts (Redis)
  auth.js         passcode check
  health.js       which keys are set; live test of every source
lib/              Data-source modules (yahoo.js, fred.js, fmp.js), stats, Redis, auth
data/baseline.js  Fundamentals seeded from the Sheet, with source + as-of dates
tests/            Unit + API tests with a mock network (npm test)
dev/server.mjs    Local server (npm run dev / npm run dev:mock)
```

## What refreshes when

| Cadence | Fields | Source |
|---|---|---|
| Every **Refresh** | Price, 1D, market cap, EV, Fwd P/E, EV/EBITDA, FCF yield, net leverage (price leg), 52w change, % off high, relative perf vs S&P (3M), every Macro row and signal, FX conversion | Yahoo (prices/history), FRED (yields, real yield, HY/IG OAS) |
| **Update fundamentals** (≤ once per 20h per name) | US names: TTM EBITDA, TTM FCF, net debt, shares, forward EPS (next FY consensus), last/next earnings date | FMP free tier |
| **Baseline file** (edit `data/baseline.js`) | Short % float, days to cover, beta; all fundamentals for Samsung, SK Hynix, TSM, ASML; anything FMP can't return | StockAnalysis.com snapshot (Nov 2026) |
| **You, in the app** | L/S/Watch, next catalyst, thesis, added/removed tickers | Synced via Redis |
| **Still needs Bloomberg / paid data** | 3M EPS revisions, EV/EBITDA z-score, breadth (% above 200DMA), factor & crowding baskets, prime-broker leverage, Korean short interest | - |

Every fundamental cell shows its source and as-of date (hover on desktop, under the value on phone). Prices older than 4 days, macro older than 5 days, fundamentals older than 120 days and short interest older than 45 days are marked stale. A series unchanged over both 1D and 1W is flagged too.

## Rules carried over from the Sheet

- Mkt cap = price × shares; EV = mkt cap + net debt (negative = net cash); EV/EBITDA = EV / LTM EBITDA; FCF yield = LTM FCF / mkt cap; Fwd P/E = price / forward EPS.
- Korean names: KRW price converted at live USD/KRW; Fwd P/E computed in KRW; KRW fundamentals converted at the live rate.
- TSM, ASML: US ADRs in USD; shares are ADR-equivalent.
- "n.m." instead of a negative or meaningless multiple.
- Flags: FCF yield < 0 (red), Net debt/EBITDA > 1x (amber), short % float > 3% (amber), days to cover > 5 (red).
- FMP never overrides KRW names, and an FMP share count more than 40% away from the baseline is rejected (protects multi-class names; GOOGL, SPCX and ANT always use the baseline share count).

## Local development

```bash
npm test             # 20 tests: calculations vs the Sheet, API with mocked sources & failures
npm run dev:mock     # http://localhost:3000 with fake data, no keys needed
FMP_API_KEY=... FRED_API_KEY=... npm run dev   # real data
```
Node 20+ required; no dependencies to install.
