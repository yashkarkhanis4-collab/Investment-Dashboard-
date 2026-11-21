// Passcode check. If DASHBOARD_PASSCODE is unset, the API is open.

import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s), 'utf8').digest();

export function passcodeRequired() {
  return !!process.env.DASHBOARD_PASSCODE;
}

export function checkPass(candidate) {
  const expected = process.env.DASHBOARD_PASSCODE;
  if (!expected) return true;
  if (typeof candidate !== 'string' || !candidate) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

/** Returns true if authorised; otherwise sends 401 and returns false. */
export function requireAuth(req, res) {
  if (checkPass(req.headers['x-dash-pass'])) return true;
  res.status(401).json({ error: 'Passcode required' });
  return false;
}
