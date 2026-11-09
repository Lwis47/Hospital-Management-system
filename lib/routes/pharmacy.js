'use strict';
const { db, save, uid } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, today, nowISO, money, validateString, validateTextFields, validateNumber, optionalDate } = require('../util');
const { addBillItem } = require('./billing');

const PHARMA = ['admin', 'pharmacist'];

function validateDrug(body) {
  const values = validateTextFields(body, ['name', 'genericName', 'category', 'unit', 'batchNo'], ['name']);
  for (const field of ['stock', 'reorderLevel']) {
    if (body[field] !== undefined) values[field] = validateNumber(body[field], field, { integer: true });
  }
  if (body.price !== undefined) values.price = money(validateNumber(body.price, 'Price'));
  if (body.expiryDate !== undefined) values.expiryDate = optionalDate(body.expiryDate, 'Expiry date');
  return values;
}

function findDrug(id) {
  const d = db.drugs.find(x => x.id === id);
  if (!d) throw new HttpError(404, 'Drug not found');
  return d;
}

module.exports = [
  ['GET', '/api/drugs', '*', () => db.drugs.slice().sort((a, b) => a.name.localeCompare(b.name))],

  ['POST', '/api/drugs', PHARMA, ({ user, body }) => {
    requireFields(body, ['name', 'price', 'stock', 'reorderLevel']);
    const values = validateDrug(body);
    const d = {
      id: uid('drg'), genericName: '', category: 'General', unit: 'Unit', batchNo: '', expiryDate: null,
      ...values
    };
    db.drugs.push(d);
    audit(user, 'create', 'drug', d.id, d.name);
    return d;
  }],

  ['PUT', '/api/drugs/:id', PHARMA, ({ user, params, body }) => {
    const d = findDrug(params.id);
    const values = validateDrug(body);
    let restock = null;
    if (body.addStock !== undefined) {
      restock = validateNumber(body.addStock, 'Restock quantity', { positive: true, integer: true });
      const stock = validateNumber(d.stock, 'Stock', { integer: true });
      const added = validateNumber(stock + restock, 'Stock', { integer: true });
      if (body.stock === undefined) values.stock = added;
    }
    Object.assign(d, values);
    if (restock !== null) audit(user, 'restock', 'drug', d.id, `+${restock} ${d.unit}`);
    audit(user, 'update', 'drug', d.id, d.name);
    return d;
  }],

  ['GET', '/api/prescriptions', ['admin', 'pharmacist', 'doctor'], ({ query }) => {
    let encs = db.encounters.filter(e => e.prescriptions.length > 0);
    if (query.patientId) encs = encs.filter(e => e.patientId === query.patientId);
    if (query.pending !== '0') {
      encs = encs.filter(e => e.prescriptions.some(p => p.dispensed < p.qty));
    }
    return encs.map(e => {
      const p = db.patients.find(x => x.id === e.patientId);
      const d = db.users.find(x => x.id === e.doctorId);
      return {
        encounterId: e.id, patientId: e.patientId, date: e.date, status: e.status,
        patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '',
        allergies: p ? p.allergies : [], doctorName: d ? d.name : 'Unassigned',
        prescriptions: e.prescriptions.map((item, idx) => ({ ...item, index: idx }))
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }],

  ['GET', '/api/dispenses', ['admin', 'pharmacist', 'doctor', 'accountant'], ({ query }) => {
    let list = db.dispenses;
    if (query.patientId) list = list.filter(d => d.patientId === query.patientId);
    return list.slice().sort((a, b) => b.date.localeCompare(a.date)).map(d => {
      const p = db.patients.find(x => x.id === d.patientId);
      return { ...d, patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown' };
    });
  }],

  ['POST', '/api/dispense', PHARMA, ({ user, body }) => {
    requireFields(body, ['patientId', 'drugId', 'qty']);
    const patientId = validateString(body.patientId, 'patientId', true);
    const drugId = validateString(body.drugId, 'drugId', true);
    const qty = validateNumber(body.qty, 'Quantity', { positive: true, integer: true });
    if (!db.patients.some(p => p.id === patientId)) throw new HttpError(404, 'Patient not found');
    const drug = findDrug(drugId);
    const stock = validateNumber(drug.stock, 'Stock', { integer: true });
    const price = money(validateNumber(drug.price, 'Drug price'));
    if (stock < qty) throw new HttpError(409, `Insufficient stock: only ${stock} ${drug.unit}(s) available`);
    if (drug.expiryDate && optionalDate(drug.expiryDate, 'Expiry date') < today()) throw new HttpError(409, 'This drug batch has expired and cannot be dispensed');
    let enc = null;
    let item = null;
    let dispensed = 0;
    if (body.encounterId !== undefined && body.encounterId !== null) {
      const encounterId = validateString(body.encounterId, 'encounterId', true);
      enc = db.encounters.find(e => e.id === encounterId);
      if (!enc) throw new HttpError(404, 'Encounter not found');
      if (enc.patientId !== patientId) throw new HttpError(400, 'Encounter belongs to a different patient');
      const idx = validateNumber(body.prescriptionIndex, 'Prescription index', { integer: true });
      item = enc.prescriptions[idx];
      if (!item || item.drugId !== drug.id) throw new HttpError(400, 'Prescription item does not match this drug');
      if (enc.prescriptions.filter(p => p.drugId === drug.id).length !== 1) throw new HttpError(409, 'Prescription contains duplicate drug entries');
      const prescribed = validateNumber(item.qty, 'Prescription quantity', { positive: true, integer: true });
      const recorded = db.dispenses.filter(d => d.encounterId === enc.id && d.drugId === drug.id)
        .reduce((sum, d) => sum + validateNumber(d.qty, 'Dispensed quantity', { integer: true }), 0);
      dispensed = validateNumber(Math.max(item.dispensed === undefined ? 0 : validateNumber(item.dispensed, 'Dispensed quantity', { integer: true }), recorded), 'Dispensed quantity', { integer: true });
      if (qty > prescribed - dispensed) throw new HttpError(409, `Only ${Math.max(0, prescribed - dispensed)} remaining on this prescription`);
    } else if (body.prescriptionIndex !== undefined) {
      throw new HttpError(400, 'Prescription index requires an encounter');
    }
    const total = money(qty * price);
    const rec = {
      id: uid('dsp'), patientId, encounterId: enc ? enc.id : null,
      drugId: drug.id, drugName: drug.name, qty, unit: drug.unit,
      unitPrice: price, total, pharmacistId: user.id, pharmacistName: user.name, date: nowISO()
    };
    addBillItem(patientId, { desc: `Pharmacy: ${drug.name}`, qty, price }, user);
    if (item) item.dispensed = dispensed + qty;
    drug.stock = stock - qty;
    db.dispenses.push(rec);
    audit(user, 'dispense', 'drug', drug.id, `${qty} x ${drug.name}`);
    return rec;
  }]
];