'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const api = require('./api/generate');
const root = __dirname;
http.createServer(async (req, res) => {
  if (req.url === '/api/generate') {
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 40000) { res.writeHead(413).end('Input too large'); return; }
        chunks.push(chunk);
      }
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      return await api(req, res);
    } catch { res.writeHead(400).end('Invalid JSON'); return; }
  }
  const file = req.url === '/' ? 'index.html' : req.url === '/favicon.svg' ? 'favicon.svg' : '';
  if (!file) { res.writeHead(404).end('Not found'); return; }
  const content = fs.readFileSync(path.join(root, file));
  res.writeHead(200, { 'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8' }).end(content);
}).listen(process.env.PORT || 3000, () => console.log('SP MCQ running on http://localhost:' + (process.env.PORT || 3000)));
