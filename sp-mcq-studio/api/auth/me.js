'use strict';
const { isAuthConfigured, sessionFromRequest, sendJSON } = require('../../lib/auth');
module.exports = function handler(req, res) {
  if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Use GET.' });
  if (!isAuthConfigured()) return sendJSON(res, 200, { enabled: false, authenticated: false });
  const user = sessionFromRequest(req);
  if (!user) return sendJSON(res, 401, { enabled: true, authenticated: false });
  return sendJSON(res, 200, {
    enabled: true,
    authenticated: true,
    user: { sub: user.sub, name: user.name, email: user.email }
  });
};
