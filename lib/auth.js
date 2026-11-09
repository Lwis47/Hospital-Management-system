'use strict';
const crypto = require('crypto');
const { db, save, uid } = require('./db');
const { HttpError, nowISO } = require('./util');

const sessions = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [salt, hash] = stored.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false;
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

function login(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || password.length > 1024) {
    throw new HttpError(400, 'Username and password must be nonempty strings');
  }
  const user = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Invalid username or password');
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL });
  audit(user, 'login', 'session', user.id);
  return { token, user: publicUser(user) };
}

function logout(token) {
  sessions.delete(token);
}

function userForToken(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  const user = db.users.find(u => u.id === s.userId);
  return user && user.active ? user : null;
}

function audit(user, action, entity, entityId, detail) {
  db.audit.unshift({
    id: uid('aud'), userId: user ? user.id : null,
    userName: user ? user.name : 'system',
    action, entity, entityId: entityId || null,
    detail: detail || null, date: nowISO()
  });
  if (db.audit.length > 5000) db.audit.length = 5000;
  save();
}

module.exports = { hashPassword, verifyPassword, publicUser, login, logout, userForToken, audit };