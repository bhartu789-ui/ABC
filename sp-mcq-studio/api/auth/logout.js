'use strict';
const { sameOrigin, clearCookie, sendJSON } = require('../../lib/auth');
module.exports = function handler(req, res) {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Use POST.' });
  if (!sameOrigin(req)) return sendJSON(res, 403, { error: 'Request origin is not allowed.' });
  res.setHeader('Set-Cookie', clearCookie());
  return sendJSON(res, 200, { signedOut: true });
};
