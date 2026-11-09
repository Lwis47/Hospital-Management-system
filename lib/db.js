'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.MEDCORE_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'users', 'patients', 'departments', 'appointments', 'encounters',
  'labTests', 'labOrders', 'drugs', 'dispenses', 'wards', 'beds',
  'admissions', 'services', 'invoices', 'audit', 'counters'
];

let db = null;
let inTransaction = false;

function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = {};
  }
  for (const c of COLLECTIONS) {
    if (!db[c]) db[c] = c === 'counters' ? {} : [];
  }
  return db;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function save() {
  if (inTransaction) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  // Windows scanners can briefly lock the destination of an atomic rename.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, DB_FILE);
      return;
    } catch (err) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(err.code) || attempt === 5) throw err;
      sleepSync(40 * (attempt + 1));
    }
  }
}

function transaction(action) {
  const current = load();
  const before = structuredClone(current);
  inTransaction = true;
  try {
    const result = action();
    inTransaction = false;
    save();
    return result;
  } catch (err) {
    Object.assign(current, before);
    throw err;
  } finally {
    inTransaction = false;
  }
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nextNum(name, prefix, width = 4) {
  const d = load();
  d.counters[name] = (d.counters[name] || 0) + 1;
  save();
  return prefix + String(d.counters[name]).padStart(width, '0');
}

module.exports = { load, save, transaction, uid, nextNum, get db() { return load(); } };