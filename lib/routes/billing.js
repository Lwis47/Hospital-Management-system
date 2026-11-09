'use strict';
const { db, save, uid, nextNum } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, nowISO, money, validateString, validateTextFields, validateNumber, validateEnum } = require('../util');

const BILL_ROLES = ['admin', 'accountant', 'receptionist'];

function billItem(item) {
  requireFields(item, ['desc', 'price']);
  const desc = validateString(item.desc, 'Description', true);
  const qty = validateNumber(item.qty === undefined ? 1 : item.qty, 'Quantity', { positive: true });
  const price = money(validateNumber(item.price, 'Price'));
  const total = money(validateNumber(qty * price, 'Item total'));
  return { desc, qty, price, total };
}

function recalc(inv) {
  const total = money(inv.items.reduce((s, i) => s + validateNumber(i.total, 'Item total'), 0));
  const paid = money(inv.payments.reduce((s, p) => s + validateNumber(p.amount, 'Payment amount'), 0));
  const balance = money(total - paid);
  if (balance < 0) throw new HttpError(400, 'Payments exceed invoice total');
  Object.assign(inv, { total, paid, balance, status: balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' });
}

function addBillItem(patientId, item, user) {
  validateString(patientId, 'patientId', true);
  const entry = billItem(item);
  const patient = db.patients.find(p => p.id === patientId);
  if (!patient) throw new HttpError(404, 'Patient not found');
  let inv = db.invoices.filter(i => i.patientId === patientId && i.status !== 'paid')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const candidate = inv ? { ...inv, items: [...inv.items, entry] } : {
    patientId, items: [entry], total: 0, paid: 0, balance: 0, status: 'unpaid',
    payments: [], createdAt: nowISO()
  };
  recalc(candidate);
  if (inv) Object.assign(inv, candidate);
  else {
    inv = { id: uid('inv'), number: nextNum('invoice', 'INV-'), ...candidate };
    db.invoices.push(inv);
  }
  save();
  audit(user, 'bill', 'invoice', inv.id, entry.desc);
  return inv;
}

function joinInvoice(inv) {
  const p = db.patients.find(x => x.id === inv.patientId);
  return { ...inv, patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '' };
}

function findInvoice(id) {
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  return inv;
}

module.exports = [
  ['GET', '/api/services', '*', () => db.services],

  ['POST', '/api/services', ['admin', 'accountant'], ({ user, body }) => {
    requireFields(body, ['name', 'price']);
    const values = validateTextFields(body, ['name', 'category'], ['name']);
    const price = money(validateNumber(body.price, 'Price'));
    const s = { id: uid('svc'), name: values.name, category: values.category || 'General', price };
    db.services.push(s);
    audit(user, 'create', 'service', s.id, s.name);
    return s;
  }],

  ['PUT', '/api/services/:id', ['admin', 'accountant'], ({ user, params, body }) => {
    const s = db.services.find(x => x.id === params.id);
    if (!s) throw new HttpError(404, 'Service not found');
    const values = validateTextFields(body, ['name', 'category'], ['name']);
    if (body.price !== undefined) values.price = money(validateNumber(body.price, 'Price'));
    Object.assign(s, values);
    audit(user, 'update', 'service', s.id);
    return s;
  }],

  ['GET', '/api/invoices', BILL_ROLES, ({ query }) => {
    let list = db.invoices;
    if (query.patientId) list = list.filter(i => i.patientId === query.patientId);
    if (query.status) list = list.filter(i => i.status === query.status);
    return list.map(joinInvoice).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }],

  ['GET', '/api/invoices/:id', BILL_ROLES, ({ params }) => joinInvoice(findInvoice(params.id))],

  ['POST', '/api/invoices', BILL_ROLES, ({ user, body }) => {
    requireFields(body, ['patientId', 'items']);
    const patientId = validateString(body.patientId, 'patientId', true);
    if (!db.patients.some(p => p.id === patientId)) throw new HttpError(404, 'Patient not found');
    if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Invoice items must be a nonempty list');
    const items = body.items.map(item => {
      requireFields(item, ['qty']);
      return billItem(item);
    });
    const candidate = { patientId, items, total: 0, paid: 0, balance: 0, status: 'unpaid', payments: [], createdAt: nowISO() };
    recalc(candidate);
    const inv = { id: uid('inv'), number: nextNum('invoice', 'INV-'), ...candidate };
    db.invoices.push(inv);
    audit(user, 'create', 'invoice', inv.id, inv.number);
    return joinInvoice(inv);
  }],

  ['POST', '/api/invoices/:id/items', BILL_ROLES, ({ user, params, body }) => {
    const inv = findInvoice(params.id);
    if (inv.status === 'paid') throw new HttpError(409, 'Invoice is already fully paid');
    const item = billItem(body);
    const candidate = { ...inv, items: [...inv.items, item] };
    recalc(candidate);
    Object.assign(inv, candidate);
    audit(user, 'update', 'invoice', inv.id, 'added item: ' + item.desc);
    return joinInvoice(inv);
  }],

  ['POST', '/api/invoices/:id/payments', BILL_ROLES, ({ user, params, body }) => {
    const inv = findInvoice(params.id);
    requireFields(body, ['amount']);
    const values = validateTextFields(body, ['reference']);
    const rawAmount = validateNumber(body.amount, 'Payment amount', { positive: true });
    const amount = money(rawAmount);
    if (amount <= 0) throw new HttpError(400, 'Payment amount must be at least 0.01');
    if (rawAmount > inv.balance || amount > inv.balance) throw new HttpError(400, `Payment exceeds outstanding balance (${inv.balance})`);
    const method = body.method === undefined ? 'Cash' : validateEnum(body.method, 'payment method', ['Cash', 'Card', 'Mobile Money', 'Bank Transfer', 'Insurance']);
    const payment = { amount, method, date: nowISO(), by: user.name, reference: values.reference || '' };
    const candidate = { ...inv, payments: [...inv.payments, payment] };
    recalc(candidate);
    Object.assign(inv, candidate);
    audit(user, 'payment', 'invoice', inv.id, `${amount} via ${method}`);
    return joinInvoice(inv);
  }]
];

module.exports.addBillItem = addBillItem;
module.exports.recalc = recalc;