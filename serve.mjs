// Optional: serve the site locally with `node serve.mjs` instead of GitHub Pages.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5178;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const PUBLIC_PATHS = /^(index\.html|styles\.css|js\/[\w-]+\.js)$/;

http.createServer(async (req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  } catch {
    rel = '';
  }
  if (!PUBLIC_PATHS.test(rel)) {
    res.writeHead(404).end('Bulunamadı');
    return;
  }
  try {
    const data = await fs.readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Bulunamadı');
  }
}).listen(PORT, HOST, () => {
  console.log(`Kripto İz çalışıyor: http://${HOST}:${PORT}`);
});
