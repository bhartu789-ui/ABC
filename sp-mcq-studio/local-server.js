'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handlers = {
  '/api/generate': require('./api/generate'),
  '/api/app': require('./api/app'),
  '/api/auth/config': require('./api/auth/config'),
  '/api/auth/me': require('./api/auth/me'),
  '/api/auth/login': require('./api/auth/login'),
  '/api/auth/logout': require('./api/auth/logout')
};
const staticPaths = new Map([
  ['/login.html', ['login.html','text/html; charset=utf-8']],
  ['/favicon.svg',['favicon.svg','image/svg+xml']],
  ['/developer-bharat.jpg',['developer-bharat.jpg','image/jpeg']]
]);
http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const handler = pathname === '/' || pathname === '/index.html' ? handlers['/api/app'] : handlers[pathname];
  if (handler) {
    if (req.method === 'POST') {
      const chunks=[];
      let size=0;
      try {
        for await (const chunk of req) {
          size+=chunk.length;
          if(size>40000){res.writeHead(413).end('Request too large');return;}
          chunks.push(chunk);
        }
        req.body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
      }catch{res.writeHead(400).end('Invalid JSON');return;}
    }
    return handler(req,res);
  }
  const stat=staticPaths.get(pathname);
  if (!stat) {res.writeHead(404).end('Not found');return;}
  try {
    const content=fs.readFileSync(path.join(__dirname,stat[0]));
    res.writeHead(200,{'Content-Type':stat[1],'Cache-Control':stat[0]==='login.html'?'no-store':'public, max-age=3600'});
    res.end(content);
  }catch{res.writeHead(404).end('Not found');}
}).listen(process.env.PORT||3000,()=>console.log('QuizMetric running on http://localhost:'+(process.env.PORT||3000)));
