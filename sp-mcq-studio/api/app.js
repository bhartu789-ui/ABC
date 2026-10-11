'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { isAuthConfigured, sessionFromRequest } = require('../lib/auth');

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }
  const enabled = isAuthConfigured();
  const user = enabled ? sessionFromRequest(req) : null;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (enabled && !user) {
    res.statusCode = 302;
    res.setHeader('Location', '/login.html');
    return res.end();
  }
  try {
    let html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    // The subject is a stable Google identifier and scopes local question sets.
    const identity = user ? JSON.stringify({ sub: user.sub, name: user.name, email: user.email }) : 'null';
    const safeIdentity = identity.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026').replace(/\u2028|\u2029/g, '');
    html = html.replace('<!-- QUIZMETRIC_SESSION -->',
      '<script>window.__QUIZMETRIC_ACCOUNT__=' + safeIdentity + ';</script>');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.end();
    return res.end(html);
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('QuizMetric is temporarily unavailable.');
  }
};
