// Baseline fundamentals, seeded from the "L/S Research Dashboard" Sheet.
// Used for non-US names, for fields FMP doesn't provide (short interest, beta),
// and whenever an FMP call fails.
//
// Units: amounts in billions of `currency` (KRW names in KRW bn, converted to
// USD at the live rate). fwdEps is per share in the stock's trading currency.
// shares in billions (ADR-equivalent for TSM/ASML). shortFloat as a fraction.
// fwdEps for most names was implied as price / forward P/E at the source date.
// Mag 7 FCF was derived as FCF yield x market cap (+/- 1-2% rounding).

const SA = 'StockAnalysis.com';

export const BASELINE = {
  AAPL: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 171.49, netDebt: -42.46, fcf: 136.23, shares: 14.5395, fwdEps: 9.42, shortFloat: 0.01, dtc: 3.59, beta: 1.09, lastEarnings: '2026-11-02', catalyst: 'Q1 FY27 earnings ~late Jan (est.)' },
  MSFT: { currency: 'USD', asOf: '2026-11-18', src: SA, ebitda: 205.69, netDebt: 69.42, fcf: 59.78, shares: 7.4273, fwdEps: 20.756, shortFloat: 0.0082, dtc: 2.78, beta: 1.05, lastEarnings: '2026-10-28', catalyst: 'Q2 FY27 earnings ~late Jan (est.)' },
  GOOGL: { currency: 'USD', asOf: '2026-11-15', src: SA, ebitda: 185.52, netDebt: -114.77, fcf: 19.66, shares: 12.3069, fwdEps: 13.789, shortFloat: 0.008, dtc: 2.67, beta: 1.23, lastEarnings: '2026-10-28', catalyst: 'Q4 earnings ~early Feb (est.)' },
  AMZN: { currency: 'USD', asOf: '2026-11-15', src: SA, ebitda: 183.72, netDebt: 190.62, fcf: -46.94, shares: 10.8003, fwdEps: 9.887, shortFloat: 0.0096, dtc: 2.3, beta: 1.5, lastEarnings: '2026-10-29', catalyst: 'Q4 earnings ~early Feb (est.)' },
  NVDA: { currency: 'USD', asOf: '2026-11-17', src: SA, ebitda: 201.27, netDebt: -23.61, fcf: 126.75, shares: 24.122, fwdEps: 12.107, shortFloat: 0.0121, dtc: 2.71, beta: 2.25, lastEarnings: '2026-11-17', catalyst: 'Q4 FY27 earnings ~late Feb (est.)' },
  META: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 116.19, netDebt: 32.39, fcf: 28.7, shares: 2.5558, fwdEps: 32.941, shortFloat: 0.0341, dtc: 3.42, beta: 1.28, lastEarnings: '2026-10-21', catalyst: 'Q4 earnings ~late Jan (est.)' },
  TSLA: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 9.84, netDebt: -29.0, fcf: 3.23, shares: 3.9465, fwdEps: 2.138, shortFloat: 0.0234, dtc: 1.78, beta: 1.74, lastEarnings: '2026-10-21', catalyst: 'Q4 deliveries early Jan; earnings ~late Jan (est.)' },
  MU: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 108.84, netDebt: -68.27, fcf: 58.96, shares: 1.1314, fwdEps: 176.488, shortFloat: 0.0207, dtc: 0.86, beta: 2.4, lastEarnings: null, catalyst: 'FQ1 FY27 earnings ~Dec 16 (est.)' },
  AMD: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 11.14, netDebt: -6.57, fcf: 7.06, shares: 1.6401, fwdEps: 15.052, shortFloat: 0.0237, dtc: 1.91, beta: 2.54, lastEarnings: '2026-11-03', catalyst: 'Q4 earnings ~early Feb (est.)' },
  INTC: { currency: 'USD', asOf: '2026-11-15', src: SA, ebitda: 19.14, netDebt: -4.18, fcf: 3.77, shares: 5.315, fwdEps: 1.392, shortFloat: 0.0314, dtc: 1.34, beta: 2.43, lastEarnings: '2026-10-29', catalyst: 'Q4 earnings ~late Jan (est.)' },
  '005930.KS': { currency: 'KRW', asOf: '2026-10-31', src: SA, ebitda: 323680, netDebt: -197630, fcf: 203080, shares: 6.3861, fwdEps: 71202.532, shortFloat: null, dtc: null, beta: 1.55, lastEarnings: '2026-10-29', catalyst: 'Q4 prelim results ~early Jan (est.)', note: 'Fundamentals from Oct 31 snapshot. Implied share count likely includes preferred shares. No free KRX short-interest data.' },
  '000660.KS': { currency: 'KRW', asOf: '2026-11-14', src: SA, ebitda: 216200, netDebt: -98660, fcf: 124520, shares: 0.7289, fwdEps: 498360.656, shortFloat: null, dtc: null, beta: 2.47, lastEarnings: '2026-10-28', catalyst: 'Q4 earnings ~late Jan (est.)', note: 'No free KRX short-interest data.' },
  TSM: { currency: 'USD', asOf: '2026-11-13', src: SA, ebitda: 113.32, netDebt: -100.36, fcf: 45.02, shares: 4.6397, fwdEps: 20.942, shortFloat: 0.0066, dtc: 2.78, beta: 1.23, lastEarnings: '2026-10-15', catalyst: 'Q4 earnings ~mid-Jan (est.); monthly sales ~10th', note: 'US ADR. Short interest is % of shares outstanding, not float. Shares are ADR-equivalent.' },
  AVGO: { currency: 'USD', asOf: '2026-11-15', src: SA, ebitda: 52.26, netDebt: 35.44, fcf: 39.4, shares: 4.7837, fwdEps: 17.403, shortFloat: 0.011, dtc: 2.33, beta: 1.51, lastEarnings: null, catalyst: 'FQ4 earnings Dec 9' },
  ASML: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 18.44, netDebt: -12.28, fcf: 23.33, shares: 0.37785, fwdEps: 63.787, shortFloat: null, dtc: 0.75, beta: 1.33, lastEarnings: '2026-10-14', catalyst: 'Q4 earnings ~late Jan (est.)', note: 'US ADR, priced in USD.' },
  CRWV: { currency: 'USD', asOf: '2026-11-16', src: SA, ebitda: 5.2, netDebt: 61.99, fcf: -20.42, shares: 0.55618, fwdEps: null, shortFloat: 0.2185, dtc: 1.34, beta: null, lastEarnings: '2026-11-10', catalyst: 'Q4 earnings ~late Feb (est.)', note: 'No positive forward EPS, so forward P/E is n.m.' },
  ORCL: { currency: 'USD', asOf: '2026-11-07', src: SA, ebitda: 34.43, netDebt: 132.07, fcf: -28.72, shares: 3.1177, fwdEps: 8.537, shortFloat: 0.0243, dtc: 1.54, beta: 1.78, lastEarnings: null, catalyst: 'FQ2 earnings ~Dec 9 (est.)', note: 'Baseline fundamentals from Nov 6-7 snapshot.' },
  SPCX: { currency: 'USD', asOf: '2026-11-14', src: SA, ebitda: 11.74, netDebt: -50.64, fcf: -39.29, shares: 13.586, fwdEps: 3.0215, shortFloat: 0.0463, dtc: 1.38, beta: null, lastEarnings: '2026-10-20', catalyst: 'IPO lock-up expiry ~Dec 9 (180d, est.); Q4 earnings ~late Jan (est.)', note: 'IPO June 12, 2026: no 52-week history or 5Y beta yet. Lock-up date is an estimate.' },
  ANT: { currency: 'USD', asOf: '2026-10-26', src: 'S-1 via StockAnalysis.com', ebitda: -111.01, netDebt: -22.01, fcf: 2.21, shares: 13.07, fwdEps: null, shortFloat: null, dtc: null, beta: null, lastEarnings: null, catalyst: "IPO'd Nov 19 @ $83; first public earnings (TBC); lock-up expiry ~May 2027", note: 'Net cash is pre-IPO (S-1) and excludes IPO proceeds and the ~$26bn concurrent placement, so EV is overstated. LTM EBITDA (-$111bn) is likely distorted by a non-cash IPO-related charge; multiples shown as n.m. Shares implied from first-day valuation.' },
};
