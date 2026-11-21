// Default watchlist and the macro instrument set.

// fmp: whether to try FMP for fundamentals (US-listed, USD-reporting names only).
// TSM / ASML are ADRs whose FMP statements are in TWD/EUR and whose share counts
// are ordinary shares, so they stay on the baseline file.
export const DEFAULT_WATCHLIST = [
  { symbol: 'AAPL', industry: 'Consumer Hardware & Services Ecosystem', fmp: true },
  { symbol: 'MSFT', industry: 'Enterprise Software & Cloud (Azure)', fmp: true },
  { symbol: 'GOOGL', industry: 'Search / Digital Ads & Cloud (GCP)', fmp: true },
  { symbol: 'AMZN', industry: 'E-commerce & Cloud Infrastructure (AWS)', fmp: true },
  { symbol: 'NVDA', industry: 'AI Accelerators (GPUs) & Networking', fmp: true },
  { symbol: 'META', industry: 'Social Media & Digital Advertising', fmp: true },
  { symbol: 'TSLA', industry: 'EVs, Energy Storage & Autonomy', fmp: true },
  { symbol: 'MU', industry: 'Memory (DRAM / HBM / NAND)', fmp: true },
  { symbol: 'AMD', industry: 'CPUs & AI GPUs (Fabless)', fmp: true },
  { symbol: 'INTC', industry: 'CPUs & Foundry (IDM)', fmp: true },
  { symbol: '005930.KS', label: 'Samsung', industry: 'Memory, Foundry & Consumer Electronics', fmp: false },
  { symbol: '000660.KS', label: 'SK Hynix', industry: 'Memory (DRAM / HBM)', fmp: false },
  { symbol: 'TSM', industry: 'Leading-edge Foundry', fmp: false },
  { symbol: 'AVGO', industry: 'Custom AI ASICs, Networking & Infra Software', fmp: true },
  { symbol: 'ASML', industry: 'Lithography Equipment (EUV)', fmp: false },
  { symbol: 'CRWV', industry: 'AI GPU Cloud (Neocloud)', fmp: true },
  { symbol: 'ORCL', industry: 'Enterprise Software & AI Cloud Infrastructure', fmp: true },
  { symbol: 'SPCX', industry: 'Launch, Satellite Broadband (Starlink) & AI (xAI)', fmp: true },
  { symbol: 'ANT', industry: 'Frontier AI Models (LLMs) & Developer Tools', fmp: true },
];

// FMP fields to ignore per symbol. Multi-class share structures: FMP may count
// only the listed class, which would understate market cap.
export const FMP_SKIP = { GOOGL: ['shares'], SPCX: ['shares'], ANT: ['shares'] };

// unit: how the level and changes are shown.
//   pct    - level as a number, changes in %
//   yield  - level in %, changes in bp
//   spread - level stored in % (FRED OAS), shown in bp; changes in bp
//   ratio  - level to 3dp, changes in %
export const MACRO_GROUPS = [
  {
    group: 'Equity',
    items: [
      { id: 'spx', name: 'S&P 500', src: 'yahoo', symbol: '^GSPC', unit: 'pct' },
      { id: 'ndx', name: 'Nasdaq-100', src: 'yahoo', symbol: '^NDX', unit: 'pct' },
      { id: 'rut', name: 'Russell 2000', src: 'yahoo', symbol: '^RUT', unit: 'pct' },
      { id: 'sox', name: 'PHLX Semiconductor (SOX)', src: 'yahoo', symbol: '^SOX', unit: 'pct' },
      { id: 'rsp', name: 'S&P 500 Equal Weight (RSP)', src: 'yahoo', symbol: 'RSP', unit: 'pct' },
      { id: 'kospi', name: 'KOSPI', src: 'yahoo', symbol: '^KS11', unit: 'pct' },
      { id: 'taiex', name: 'TAIEX', src: 'yahoo', symbol: '^TWII', unit: 'pct' },
      { id: 'nikkei', name: 'Nikkei 225', src: 'yahoo', symbol: '^N225', unit: 'pct' },
      { id: 'sx5e', name: 'Euro Stoxx 50', src: 'yahoo', symbol: '^STOXX50E', unit: 'pct' },
      { id: 'hsi', name: 'Hang Seng', src: 'yahoo', symbol: '^HSI', unit: 'pct' },
      { id: 'sti', name: 'Straits Times (STI)', src: 'yahoo', symbol: '^STI', unit: 'pct' },
    ],
  },
  {
    group: 'Volatility',
    items: [
      { id: 'vix', name: 'VIX', src: 'yahoo', symbol: '^VIX', unit: 'pct' },
      { id: 'vix3m', name: 'VIX 3-Month', src: 'yahoo', symbol: '^VIX3M', unit: 'pct' },
      { id: 'move', name: 'MOVE (Treasury vol)', src: 'yahoo', symbol: '^MOVE', unit: 'pct' },
      { id: 'skew', name: 'CBOE SKEW', src: 'yahoo', symbol: '^SKEW', unit: 'pct' },
    ],
  },
  {
    group: 'Rates',
    items: [
      { id: 'ust2', name: 'US 2Y Treasury', src: 'fred', symbol: 'DGS2', unit: 'yield' },
      { id: 'ust10', name: 'US 10Y Treasury', src: 'fred', symbol: 'DGS10', unit: 'yield' },
      { id: 'ust30', name: 'US 30Y Treasury', src: 'fred', symbol: 'DGS30', unit: 'yield' },
      { id: 'real10', name: 'US 10Y Real Yield (TIPS)', src: 'fred', symbol: 'DFII10', unit: 'yield' },
    ],
  },
  {
    group: 'Credit',
    items: [
      { id: 'hyoas', name: 'US HY OAS (ICE BofA)', src: 'fred', symbol: 'BAMLH0A0HYM2', unit: 'spread' },
      { id: 'igoas', name: 'US IG OAS (ICE BofA)', src: 'fred', symbol: 'BAMLC0A0CM', unit: 'spread' },
      { id: 'hyg', name: 'HY Bond ETF (HYG)', src: 'yahoo', symbol: 'HYG', unit: 'pct' },
      { id: 'lqd', name: 'IG Bond ETF (LQD)', src: 'yahoo', symbol: 'LQD', unit: 'pct' },
    ],
  },
  {
    group: 'FX',
    items: [
      { id: 'dxy', name: 'US Dollar Index (DXY)', src: 'yahoo', symbol: 'DX-Y.NYB', unit: 'pct' },
      { id: 'usdjpy', name: 'USD/JPY', src: 'yahoo', symbol: 'JPY=X', unit: 'pct' },
      { id: 'usdkrw', name: 'USD/KRW', src: 'yahoo', symbol: 'KRW=X', unit: 'pct' },
      { id: 'usdtwd', name: 'USD/TWD', src: 'yahoo', symbol: 'TWD=X', unit: 'pct' },
      { id: 'eurusd', name: 'EUR/USD', src: 'yahoo', symbol: 'EURUSD=X', unit: 'pct' },
      { id: 'usdcny', name: 'USD/CNY', src: 'yahoo', symbol: 'CNY=X', unit: 'pct' },
    ],
  },
  {
    group: 'Commodities',
    items: [
      { id: 'wti', name: 'WTI Crude', src: 'yahoo', symbol: 'CL=F', unit: 'pct' },
      { id: 'gold', name: 'Gold', src: 'yahoo', symbol: 'GC=F', unit: 'pct' },
      { id: 'copper', name: 'Copper', src: 'yahoo', symbol: 'HG=F', unit: 'pct' },
      { id: 'btc', name: 'Bitcoin', src: 'yahoo', symbol: 'BTC-USD', unit: 'pct' },
    ],
  },
  {
    group: 'Ratios',
    items: [
      { id: 'vixterm', name: 'VIX / VIX3M (>1 = inverted)', src: 'ratio', of: ['vix', 'vix3m'], unit: 'ratio' },
      { id: 'rspspy', name: 'Equal-wt / Cap-wt (RSP/SPY)', src: 'ratio', of: ['rsp', 'spy'], unit: 'ratio' },
      { id: 'cugold', name: 'Copper / Gold (x1000)', src: 'ratio', of: ['copper', 'gold'], mult: 1000, unit: 'ratio' },
      { id: 'soxspx', name: 'SOX / S&P 500', src: 'ratio', of: ['sox', 'spx'], unit: 'ratio' },
    ],
  },
];

// Series needed for ratios but not shown as their own row.
export const HIDDEN_SERIES = [{ id: 'spy', src: 'yahoo', symbol: 'SPY' }];

export const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;
