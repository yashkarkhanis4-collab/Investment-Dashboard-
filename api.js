import { SYMBOL_RE } from './universe.js';

export const MAX_SYMBOLS = 60;

/** Parse ?symbols=A,B,C (or a JSON array) into a clean, de-duplicated list. */
export function parseSymbols(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(',');
  const out = [];
  for (const raw of list) {
    const s = String(raw).trim().toUpperCase();
    if (s && SYMBOL_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= MAX_SYMBOLS) break;
  }
  return out;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'Method not allowed' });
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}
