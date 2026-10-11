'use strict';

// First-party session verification for QuizMetric. No passwords are stored.
// Google ID token signatures are verified locally against Google's rotating JWKS.
const { createHmac, timingSafeEqual, createPublicKey, verify: verifySignature } = require('node:crypto');

const COOKIE = '__Host-qm_session';
const SESSION_AGE = 60 * 60 * 24 * 7;
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = null;
let cacheUntil = 0;

function isAuthConfigured() {
  const id = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const secret = String(process.env.SESSION_SECRET || '');
  return /^[0-9]+-[\w-]+\.apps\.googleusercontent\.com$/.test(id) && secret.length >= 32;
}

function sign(payload) {
  return createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

function sessionToken(user, now = Math.floor(Date.now() / 1000)) {
  if (!isAuthConfigured()) throw new Error('Sign-in is not yet configured.');
  const claims = {
    v: 1,
    sub: String(user.sub).slice(0, 150),
    name: String(user.name || '').slice(0, 120),
    email: String(user.email || '').slice(0, 254),
    iat: now,
    exp: now + SESSION_AGE
  };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return encoded + '.' + sign(encoded);
}

function sessionFromToken(token, now = Math.floor(Date.now() / 1000)) {
  if (!isAuthConfigured() || typeof token !== 'string' || token.length > 3072) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) return null;
  const signature = Buffer.from(parts[1], 'base64url');
  const actual = Buffer.from(sign(parts[0]), 'base64url');
  if (signature.length !== actual.length || !timingSafeEqual(signature, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.v !== 1 || typeof data.sub !== 'string' || !data.sub ||
        !Number.isInteger(data.iat) || !Number.isInteger(data.exp) ||
        data.iat > now + 60 || data.exp <= now || data.exp - data.iat > SESSION_AGE ||
        typeof data.email !== 'string' || typeof data.name !== 'string') return null;
    return { sub: data.sub, name: data.name, email: data.email, exp: data.exp };
  } catch {
    return null;
  }
}

function sessionFromRequest(req) {
  const raw = String(req.headers?.cookie || '');
  const value = raw.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  if (!value) return null;
  return sessionFromToken(value.slice(COOKIE.length + 1));
}

function cookieForUser(user) {
  return COOKIE + '=' + sessionToken(user) + '; Path=/; Max-Age=' + SESSION_AGE +
    '; HttpOnly; Secure; SameSite=Lax';
}

function clearCookie() {
  return COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.host || '');
  if (!origin || !host || /[\s/@]/.test(host)) return false;
  return origin === 'https://' + host ||
    ((host.startsWith('localhost:') || host === 'localhost') && origin === 'http://' + host);
}

function sendJSON(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function requireSession(req, res) {
  if (!isAuthConfigured()) return true; // Activation requires both Google client and session key.
  const user = sessionFromRequest(req);
  if (user) return true;
  sendJSON(res, 401, { error: 'Please sign in with Google to continue.', loginRequired: true });
  return false;
}

async function fetchGoogleKeys(fetcher = fetch) {
  const now = Date.now();
  if (jwksCache && now < cacheUntil) return jwksCache;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(JWKS_URL, { signal: controller.signal });
    if (!response.ok) throw new Error('Google identity keys are unavailable.');
    const data = await response.json();
    if (!data || !Array.isArray(data.keys) || !data.keys.length) throw new Error('Invalid Google key list.');
    const cacheHeader = String(response.headers?.get?.('cache-control') || '');
    const match = cacheHeader.match(/max-age=(\d+)/i);
    const lifetime = match ? Math.min(3600, Math.max(60, Number(match[1]))) : 600;
    jwksCache = data.keys;
    cacheUntil = now + lifetime * 1000;
    return jwksCache;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyGoogleToken(jwt, { clientId = process.env.GOOGLE_CLIENT_ID, fetcher = fetch } = {}) {
  if (typeof jwt !== 'string' || jwt.length > 8192 || jwt.length < 100) throw new Error('Invalid sign-in token.');
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Malformed Google token.');
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Google token.');
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unexpected Google token algorithm.');
  }
  const keys = await fetchGoogleKeys(fetcher);
  const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
  if (!key) throw new Error('Unrecognized Google signing key.');
  let valid = false;
  try {
    valid = verifySignature('RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('Google token signature verification failed.');
  const now = Math.floor(Date.now() / 1000);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss) ||
      payload.aud !== clientId || typeof clientId !== 'string' ||
      (payload.azp != null && payload.azp !== clientId) ||
      !Number.isInteger(payload.exp) || payload.exp <= now ||
      !Number.isInteger(payload.iat) || payload.iat > now + 60 ||
      (payload.nbf != null && payload.nbf > now + 60) ||
      typeof payload.sub !== 'string' || !/^\d{6,30}$/.test(payload.sub) ||
      (payload.email_verified !== true && payload.email_verified !== 'true') ||
      typeof payload.email !== 'string' || !payload.email.includes('@')) {
    throw new Error('Google sign-in could not be verified.');
  }
  return { sub: payload.sub, name: typeof payload.name === 'string' ? payload.name : '', email: payload.email };
}

module.exports = {
  COOKIE, isAuthConfigured, sessionToken, sessionFromToken, sessionFromRequest,
  cookieForUser, clearCookie, sameOrigin, sendJSON, requireSession, verifyGoogleToken
};
