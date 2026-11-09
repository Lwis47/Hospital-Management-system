'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { load, transaction } = require('./lib/db');
const { seed } = require('./lib/seed');
const { handleApi } = require('./lib/api');

load();
transaction(seed);

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  let rel;
  try { rel = decodeURIComponent(urlPath); }
  catch { res.writeHead(400); return res.end('Invalid URL'); }
  if (rel.includes('\0')) { res.writeHead(400); return res.end('Invalid URL'); }
  if (rel === '/') rel = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, '.' + rel);
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT' && !path.extname(filePath)) return serveStatic(req, res, '/index.html');
      res.writeHead(404); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    handleApi(req, res).catch(err => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
    return;
  }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, HOST, () => {
  console.log(`MedCore Hospital Management System running at http://${HOST}:${server.address().port}`);
});
