'use strict';
const { isAuthConfigured, sendJSON } = require('../../lib/auth');
module.exports = function handler(req, res) {
  if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Use GET.' });
  const enabled = isAuthConfigured();
  return sendJSON(res, 200, {
    enabled,
    clientId: enabled ? String(process.env.GOOGLE_CLIENT_ID) : null
  });
};
