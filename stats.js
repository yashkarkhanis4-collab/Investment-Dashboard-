// Turn a daily series [{d: 'YYYY-MM-DD', v: number}] (ascending) into the
// standard set of changes and levels used across the dashboard.

const DAY = 86400000;

function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}

/** Last point with date <= cutoff (string compare works for ISO dates). */
function lastOnOrBefore(points, cutoff) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].d <= cutoff) return points[i];
  return null;
}

function lastBefore(points, cutoff) {
  for (let i = points.length - 1; i >= 0; i--) if (points[i].d < cutoff) return points[i];
  return null;
}

export function seriesStats(points) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.v));
  const n = pts.length;
  if (n < 2) return null;
  const last = pts[n - 1];
  const at = (k) => (n - 1 - k >= 0 ? pts[n - 1 - k].v : null);
  const year = last.d.slice(0, 4);
  const ytdBase = lastBefore(pts, `${year}-01-01`);
  const yearAgo = lastOnOrBefore(pts, addDays(last.d, -365));
  const win = pts.filter((p) => p.d > addDays(last.d, -365));
  const vals = win.map((p) => p.v);
  const last200 = pts.slice(-200).map((p) => p.v);
  const p1 = at(1);
  const p5 = at(5);
  return {
    asOf: last.d,
    last: last.v,
    p1,
    p5,
    p21: at(21),
    p63: at(63),
    p252: yearAgo ? yearAgo.v : null,
    ytdBase: ytdBase ? ytdBase.v : null,
    hi52: Math.max(...vals),
    lo52: Math.min(...vals),
    ma200: last200.length >= 150 ? last200.reduce((a, b) => a + b, 0) / last200.length : null,
    // Unchanged over both 1D and 1W usually means a feed has stopped updating.
    flat: p1 !== null && p5 !== null && last.v === p1 && last.v === p5,
    n,
  };
}

/** Ratio series of two point arrays, aligned on dates present in both. */
export function ratioPoints(a, b, mult = 1) {
  const mb = new Map(b.map((p) => [p.d, p.v]));
  const out = [];
  for (const p of a) {
    const vb = mb.get(p.d);
    if (Number.isFinite(vb) && vb !== 0 && Number.isFinite(p.v)) out.push({ d: p.d, v: (p.v / vb) * mult });
  }
  return out;
}
