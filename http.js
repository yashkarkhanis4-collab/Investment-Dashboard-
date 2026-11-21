// Small HTTP helpers shared by the data-source modules.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch JSON with a timeout. Retries once on 429 / 5xx / network error.
 * Throws HttpError with a short, human-readable message on failure.
 */
export async function fetchJson(url, { timeoutMs = 9000, retries = 1, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new HttpError(502, 'Response was not JSON');
        }
      }
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new HttpError(res.status, statusMessage(res.status));
      if (!retryable || attempt === retries) throw lastErr;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof HttpError && !(e.status === 429 || e.status >= 500)) throw e;
      lastErr =
        e instanceof HttpError
          ? e
          : new HttpError(0, e.name === 'AbortError' ? 'Timed out' : 'Network error');
      if (attempt === retries) throw lastErr;
    }
    await sleep(700 + Math.random() * 600);
  }
  throw lastErr;
}

function statusMessage(s) {
  if (s === 401 || s === 403) return `Access denied (${s}) - key missing, invalid, or endpoint not on your plan`;
  if (s === 402) return 'Not available on the free plan (402)';
  if (s === 404) return 'Symbol not found (404)';
  if (s === 429) return 'Rate limited (429)';
  return `HTTP ${s}`;
}

/** Run async fn over items with at most `limit` in flight. Preserves order. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
