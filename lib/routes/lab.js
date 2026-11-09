'use strict';
const { db, save, uid } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, nowISO, validateObject, validateString, validateTextFields, validateNumber, validateEnum, money } = require('../util');
const { addBillItem } = require('./billing');

const LAB_VIEW = ['admin', 'labtech', 'doctor', 'nurse'];
const FLOW = ['ordered', 'sample-collected', 'processing', 'completed'];

function joinOrder(o) {
  const p = db.patients.find(x => x.id === o.patientId);
  const t = db.labTests.find(x => x.id === o.testId);
  const d = db.users.find(x => x.id === o.orderedBy);
  return {
    ...o,
    patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '',
    testName: t ? t.name : 'Unknown', testPrice: t ? t.price : 0,
    sampleType: t ? t.sampleType : '', orderedByName: d ? d.name : 'Unknown'
  };
}

module.exports = [
  ['GET', '/api/labtests', '*', () => db.labTests],

  ['POST', '/api/labtests', ['admin', 'labtech'], ({ user, body }) => {
    requireFields(body, ['name', 'price']);
    const values = validateTextFields(body, ['name', 'category', 'sampleType'], ['name']);
    const price = money(validateNumber(body.price, 'Price'));
    const t = { id: uid('lt'), name: values.name, category: values.category || 'General', price, sampleType: values.sampleType || 'Blood' };
    db.labTests.push(t);
    audit(user, 'create', 'labTest', t.id, t.name);
    return t;
  }],

  ['GET', '/api/laborders', LAB_VIEW, ({ query }) => {
    let list = db.labOrders;
    if (query.status) list = list.filter(o => o.status === query.status);
    if (query.patientId) list = list.filter(o => o.patientId === query.patientId);
    if (query.encounterId) list = list.filter(o => o.encounterId === query.encounterId);
    if (query.pending === '1') list = list.filter(o => o.status !== 'completed');
    return list.map(joinOrder).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }],

  ['POST', '/api/laborders', ['admin', 'doctor'], ({ user, body }) => {
    requireFields(body, ['patientId', 'testId']);
    const patientId = validateString(body.patientId, 'patientId', true);
    const testId = validateString(body.testId, 'testId', true);
    const notes = body.notes === undefined ? '' : validateString(body.notes, 'Notes');
    if (!db.patients.some(p => p.id === patientId)) throw new HttpError(404, 'Patient not found');
    const test = db.labTests.find(t => t.id === testId);
    if (!test) throw new HttpError(404, 'Lab test not found');
    money(validateNumber(test.price, 'Lab test price'));
    let enc = null;
    if (body.encounterId !== undefined && body.encounterId !== null) {
      const encounterId = validateString(body.encounterId, 'encounterId', true);
      enc = db.encounters.find(e => e.id === encounterId);
      if (!enc) throw new HttpError(404, 'Encounter not found');
      if (enc.patientId !== patientId) throw new HttpError(400, 'Encounter belongs to a different patient');
      if (enc.status !== 'open') throw new HttpError(409, 'Cannot order a test on a closed encounter');
    }
    const o = {
      id: uid('lab'), encounterId: enc ? enc.id : null, patientId,
      testId: test.id, status: 'ordered', result: '', resultDate: null,
      notes, orderedBy: user.id, technicianId: null,
      billed: false, createdAt: nowISO()
    };
    db.labOrders.push(o);
    if (enc) enc.labOrderIds = [...(enc.labOrderIds || []), o.id];
    audit(user, 'order', 'labOrder', o.id, test.name);
    return joinOrder(o);
  }],

  ['PUT', '/api/laborders/:id', ['admin', 'labtech'], ({ user, params, body }) => {
    const o = db.labOrders.find(x => x.id === params.id);
    if (!o) throw new HttpError(404, 'Lab order not found');
    validateObject(body);
    if (o.status === 'completed') throw new HttpError(409, 'Completed lab results are immutable');
    const candidate = { ...o };
    if (body.result !== undefined) candidate.result = validateString(body.result, 'Result');
    if (body.notes !== undefined) validateString(body.notes, 'Notes');
    if (body.status !== undefined) {
      validateEnum(body.status, 'lab status', FLOW);
      const cur = FLOW.indexOf(o.status);
      const next = FLOW.indexOf(body.status);
      if (next !== cur + 1) throw new HttpError(409, `Cannot move from ${o.status} to ${body.status}; expected ${FLOW[cur + 1] || 'no further step'}`);
      if (body.status === 'completed') validateString(body.result, 'Result', true);
      candidate.status = body.status;
      candidate.technicianId = user.id;
      if (body.status === 'completed') {
        candidate.resultDate = nowISO();
        if (!o.billed) {
          const test = db.labTests.find(t => t.id === o.testId);
          addBillItem(o.patientId, { desc: `Lab: ${test ? test.name : 'test'}`, qty: 1, price: test ? test.price : 0 }, user);
          candidate.billed = true;
        }
      }
    }
    Object.assign(o, candidate);
    audit(user, 'update', 'labOrder', o.id, o.status);
    return joinOrder(o);
  }]
];