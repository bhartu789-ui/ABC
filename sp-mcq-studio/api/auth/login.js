'use strict';
const {
  isAuthConfigured, sameOrigin, verifyGoogleToken, cookieForUser, sendJSON
} = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Use POST.' });
  if (!isAuthConfigured()) return sendJSON(res, 503, { error: 'Google sign-in setup is not complete.' });
  if (!sameOrigin(req)) return sendJSON(res, 403, { error: 'Sign-in request origin is not allowed.' });
  let data = req.body || {};
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch { return sendJSON(res, 400, { error: 'Invalid request.' }); }
  }
  if (!data || typeof data !== 'object' || typeof data.credential !== 'string' ||
      data.credential.length > 8192 || Buffer.byteLength(JSON.stringify(data)) > 10000) {
    return sendJSON(res, 400, { error: 'Invalid sign-in request.' });
  }
  try {
    const user = await verifyGoogleToken(data.credential);
    res.setHeader('Set-Cookie', cookieForUser(user));
    return sendJSON(res, 200, { authenticated: true, user: { name: user.name, email: user.email } });
  } catch {
    return sendJSON(res, 401, { error: 'Could not verify Google sign-in. Please try again.' });
  }
};
