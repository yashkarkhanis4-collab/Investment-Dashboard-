// Minimal Upstash Redis REST client. Works with the env vars Vercel adds when
// you connect Upstash from the Storage tab (KV_* or UPSTASH_REDIS_REST_*).

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function redisConfigured() {
  return !!creds();
}

async function cmd(...args) {
  const c = creds();
  if (!c) throw new Error('Redis not configured');
  const res = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Redis error: ${body.error || res.status}`);
  return body.result;
}

export async function getJson(key) {
  const v = await cmd('GET', key);
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export async function setJson(key, value, ttlSeconds) {
  const s = JSON.stringify(value);
  return ttlSeconds ? cmd('SET', key, s, 'EX', String(ttlSeconds)) : cmd('SET', key, s);
}

export async function incrBy(key, n, ttlSeconds) {
  const v = await cmd('INCRBY', key, String(n));
  if (ttlSeconds) await cmd('EXPIRE', key, String(ttlSeconds));
  return Number(v);
}

export async function getNumber(key) {
  const v = await cmd('GET', key);
  return v === null || v === undefined ? 0 : Number(v);
}

export async function ping() {
  return (await cmd('PING')) === 'PONG';
}
