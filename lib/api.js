'use strict';
const { userForToken, login, logout, publicUser } = require('./auth');
const { HttpError, validateObject } = require('./util');
const { transaction } = require('./db');

const routes = [];
function register(list) {
  for (const [method, pattern, roles, handler] of list) {
    routes.push({ method, segs: pattern.split('/').filter(Boolean), roles, handler });
  }
}

register(require('./routes/patients'));
register(require('./routes/appointments'));
register(require('./routes/encounters'));
register(require('./routes/lab'));
register(require('./routes/pharmacy'));
register(require('./routes/inpatient'));
register(require('./routes/billing'));
register(require('./routes/admin'));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1e6) {
        chunks.length = 0;
        reject(new HttpError(413, 'Request too large'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > 1e6) return;
      if (!size) return resolve({});
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reject(new HttpError(400, 'Invalid JSON body')); }
      try { resolve(validateObject(body)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const segs = url.pathname.split('/').filter(Boolean);
  const query = Object.fromEntries(url.searchParams.entries());

  try {
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      return json(res, 200, transaction(() => login(body.username, body.password)));
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = token ? userForToken(token) : null;
    if (!user) throw new HttpError(401, 'Not authenticated');

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      logout(token);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      return json(res, 200, publicUser(user));
    }

    const match = routes.find(r => {
      if (r.method !== req.method || r.segs.length !== segs.length) return false;
      return r.segs.every((s, i) => s.startsWith(':') || s === segs[i]);
    });
    if (!match) throw new HttpError(404, 'Endpoint not found');
    if (match.roles !== '*' && !match.roles.includes(user.role)) {
      throw new HttpError(403, 'Your role does not have permission for this action');
    }

    const params = {};
    match.segs.forEach((s, i) => { if (s.startsWith(':')) params[s.slice(1)] = segs[i]; });
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const action = () => match.handler({ user, body, params, query, token });
    const result = req.method === 'GET' ? action() : transaction(action);
    json(res, 200, result === undefined ? { ok: true } : result);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    json(res, status, { error: status === 500 ? 'Unable to complete this request. Check the server logs.' : err.message });
  }
}

module.exports = { handleApi };