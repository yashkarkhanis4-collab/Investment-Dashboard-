// Local dev server: serves /public and runs the /api functions like Vercel does.
//   npm run dev          -> real data (set FMP_API_KEY, FRED_API_KEY in your shell)
//   npm run dev:mock     -> fake data, no keys or network needed
// Extra env for testing: MOCK_REDIS=1 (in-memory sync), PORT=3000

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pub = join(root, 'public');
const PORT = Number(process.env.PORT || 3000);

if (process.env.MOCK) {
  const { installMockFetch } = await import('../tests/mock.mjs');
  installMockFetch({ redis: !!process.env.MOCK_REDIS });
  console.log('Mock data mode', process.env.MOCK_REDIS ? '(with in-memory Redis)' : '(no Redis)');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function adapt(res) {
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (o) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(o));
  };
  return res;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
        const mod = await import(join(root, 'api', `${name}.js`));
        let raw = '';
        for await (const c of req) raw += c;
        req.query = Object.fromEntries(url.searchParams);
        try {
          req.body = raw ? JSON.parse(raw) : undefined;
        } catch {
          req.body = raw;
        }
        return await mod.default(req, adapt(res));
      }
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p === '/' || p === '\\') p = '/index.html';
      const file = join(pub, p);
      if (!file.startsWith(pub)) throw Object.assign(new Error('Forbidden'), { code: 'ENOENT' });
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND') {
        res.writeHead(404);
        return res.end('Not found');
      }
      console.error(e);
      res.writeHead(500);
      res.end('Server error');
    }
  })
  .listen(PORT, () => console.log(`Dashboard on http://localhost:${PORT}`));
