'use strict';
const { db, save, uid } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, today, nowISO, daysBetween, money, validateObject, validateString, validateTextFields, validateNumber, validateDate, validateEnum } = require('../util');
const { addBillItem } = require('./billing');

const IPD_VIEW = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant'];

function closeBedSegment(admission, endDate) {
  const admitDate = validateDate(admission.admitDate, 'Admission date', { max: today() });
  const history = (admission.bedHistory || []).map(segment => ({ ...segment }));
  let index = history.findIndex(segment => segment.bedId === admission.bedId && segment.endDate === null);
  const startDate = admission.bedStartDate || (index >= 0 ? history[index].startDate : admitDate);
  validateDate(startDate, 'Bed start date', { min: admitDate, max: today() });
  validateDate(endDate, 'Segment end date', { min: startDate, max: today() });
  if (index < 0) {
    history.push({ bedId: admission.bedId, startDate, endDate: null });
    index = history.length - 1;
  }
  history[index].endDate = endDate;
  return { history, startDate, days: Math.max(1, daysBetween(startDate, endDate)) };
}

function occupiedBed(admission) {
  const bed = findBed(admission.bedId);
  if (bed.status !== 'occupied' || bed.patientId !== admission.patientId) throw new HttpError(409, 'Admission does not own the current occupied bed');
  return bed;
}

function findBed(id) {
  const b = db.beds.find(x => x.id === id);
  if (!b) throw new HttpError(404, 'Bed not found');
  return b;
}

function joinAdmission(a) {
  const p = db.patients.find(x => x.id === a.patientId);
  const b = db.beds.find(x => x.id === a.bedId);
  const w = b ? db.wards.find(x => x.id === b.wardId) : null;
  const d = db.users.find(x => x.id === a.doctorId);
  return {
    ...a,
    patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '',
    bedLabel: b ? b.label : '?', wardName: w ? w.name : '?', wardRate: w ? w.dailyRate : 0,
    doctorName: d ? d.name : 'Unknown'
  };
}

module.exports = [
  ['GET', '/api/wards', '*', () => db.wards.map(w => ({
    ...w,
    bedCount: db.beds.filter(b => b.wardId === w.id).length,
    occupied: db.beds.filter(b => b.wardId === w.id && b.status === 'occupied').length
  }))],

  ['POST', '/api/wards', ['admin'], ({ user, body }) => {
    requireFields(body, ['name', 'dailyRate']);
    const values = validateTextFields(body, ['name', 'type'], ['name']);
    const dailyRate = money(validateNumber(body.dailyRate, 'Daily rate'));
    const w = { id: uid('wrd'), name: values.name, type: values.type || 'General', dailyRate };
    db.wards.push(w);
    audit(user, 'create', 'ward', w.id, w.name);
    return w;
  }],

  ['GET', '/api/beds', '*', ({ query }) => {
    let list = db.beds;
    if (query.wardId) list = list.filter(b => b.wardId === query.wardId);
    if (query.status) list = list.filter(b => b.status === query.status);
    return list.map(b => {
      const w = db.wards.find(x => x.id === b.wardId);
      const p = b.patientId ? db.patients.find(x => x.id === b.patientId) : null;
      return { ...b, wardName: w ? w.name : '?', patientName: p ? `${p.firstName} ${p.lastName}` : null };
    });
  }],

  ['POST', '/api/beds', ['admin', 'nurse'], ({ user, body }) => {
    requireFields(body, ['wardId', 'label']);
    const wardId = validateString(body.wardId, 'wardId', true);
    const label = validateString(body.label, 'Bed label', true);
    if (!db.wards.some(w => w.id === wardId)) throw new HttpError(404, 'Ward not found');
    if (db.beds.some(b => b.label === label)) throw new HttpError(409, 'A bed with that label already exists');
    const b = { id: uid('bed'), wardId, label, status: 'available', patientId: null };
    db.beds.push(b);
    audit(user, 'create', 'bed', b.id, b.label);
    return b;
  }],

  ['PUT', '/api/beds/:id', ['admin', 'nurse'], ({ user, params, body }) => {
    const b = findBed(params.id);
    validateObject(body);
    if (body.status !== undefined) {
      validateEnum(body.status, 'bed status (occupied is set by admission)', ['available', 'cleaning', 'maintenance']);
      if (b.status === 'occupied') throw new HttpError(409, 'Bed is occupied; discharge or transfer the patient first');
      b.status = body.status;
    }
    audit(user, 'update', 'bed', b.id, b.status);
    return b;
  }],

  ['GET', '/api/admissions', IPD_VIEW, ({ query }) => {
    let list = db.admissions;
    if (query.status) list = list.filter(a => a.status === query.status);
    if (query.patientId) list = list.filter(a => a.patientId === query.patientId);
    return list.map(joinAdmission).sort((a, b) => b.admitDate.localeCompare(a.admitDate));
  }],

  ['POST', '/api/admissions', ['admin', 'doctor'], ({ user, body }) => {
    requireFields(body, ['patientId', 'bedId', 'doctorId']);
    const patientId = validateString(body.patientId, 'patientId', true);
    const doctorId = validateString(body.doctorId, 'doctorId', true);
    const bedId = validateString(body.bedId, 'bedId', true);
    const values = validateTextFields(body, ['diagnosis', 'notes']);
    const admitDate = validateDate(body.admitDate === undefined ? today() : body.admitDate, 'Admission date', { max: today() });
    if (!db.patients.some(p => p.id === patientId)) throw new HttpError(404, 'Patient not found');
    if (!db.users.some(u => u.id === doctorId && u.role === 'doctor' && u.active)) throw new HttpError(404, 'Active doctor not found');
    if (db.admissions.some(a => a.patientId === patientId && a.status === 'admitted')) throw new HttpError(409, 'Patient is already admitted');
    const bed = findBed(bedId);
    if (bed.status !== 'available') throw new HttpError(409, `Bed ${bed.label} is ${bed.status}, not available`);
    const a = {
      id: uid('adm'), patientId, bedId: bed.id, doctorId,
      admitDate, bedStartDate: admitDate, dischargeDate: null,
      bedHistory: [{ bedId: bed.id, startDate: admitDate, endDate: null }],
      diagnosis: values.diagnosis || '', status: 'admitted', notes: values.notes || '', createdAt: nowISO()
    };
    db.admissions.push(a);
    bed.status = 'occupied';
    bed.patientId = patientId;
    audit(user, 'admit', 'admission', a.id, `bed ${bed.label}`);
    return joinAdmission(a);
  }],

  ['PUT', '/api/admissions/:id', ['admin', 'doctor', 'nurse'], ({ user, params, body }) => {
    const a = db.admissions.find(x => x.id === params.id);
    if (!a) throw new HttpError(404, 'Admission not found');
    if (a.status !== 'admitted') throw new HttpError(409, 'Patient is already discharged');

    validateObject(body);
    const values = validateTextFields(body, ['notes', 'diagnosis']);
    if (body.action !== undefined) validateEnum(body.action, 'admission action', ['transfer', 'discharge']);
    if (body.dischargeDate !== undefined) validateDate(body.dischargeDate, 'Discharge date', { min: a.bedStartDate || a.admitDate, max: today() });
    if (body.admitDate !== undefined) {
      validateDate(body.admitDate, 'Admission date', { max: today() });
      if (body.admitDate !== a.admitDate) throw new HttpError(400, 'Admission date cannot be changed');
    }
    if (body.action === 'transfer') {
      requireFields(body, ['bedId']);
      const newBed = findBed(validateString(body.bedId, 'bedId', true));
      if (newBed.status !== 'available') throw new HttpError(409, `Bed ${newBed.label} is not available`);
      const oldBed = occupiedBed(a);
      const oldWard = db.wards.find(w => w.id === oldBed.wardId);
      const transferDate = today();
      const segment = closeBedSegment(a, transferDate);
      const days = segment.days;
      segment.history.push({ bedId: newBed.id, startDate: transferDate, endDate: null });
      addBillItem(a.patientId, { desc: `Bed charge — ${oldWard ? oldWard.name : 'ward'} (${days} day${days > 1 ? 's' : ''}, transfer)`, qty: days, price: oldWard ? oldWard.dailyRate : 0 }, user);
      oldBed.status = 'cleaning'; oldBed.patientId = null;
      newBed.status = 'occupied'; newBed.patientId = a.patientId;
      a.bedId = newBed.id;
      a.bedStartDate = transferDate;
      a.bedHistory = segment.history;
      audit(user, 'transfer', 'admission', a.id, `${oldBed.label} -> ${newBed.label}`);
    } else if (body.action === 'discharge') {
      const dischargeDate = body.dischargeDate === undefined ? today() : body.dischargeDate;
      const bed = occupiedBed(a);
      const ward = db.wards.find(w => w.id === bed.wardId);
      const segment = closeBedSegment(a, dischargeDate);
      const days = segment.days;
      addBillItem(a.patientId, { desc: `Bed charge — ${ward ? ward.name : 'ward'} (${days} day${days > 1 ? 's' : ''})`, qty: days, price: ward ? ward.dailyRate : 0 }, user);
      a.status = 'discharged';
      a.dischargeDate = dischargeDate;
      a.bedStartDate = segment.startDate;
      a.bedHistory = segment.history;
      if (values.notes !== undefined) a.notes = values.notes;
      bed.status = 'cleaning';
      bed.patientId = null;
      audit(user, 'discharge', 'admission', a.id, `${days} day(s)`);
    } else if (body.notes !== undefined || body.diagnosis !== undefined) {
      Object.assign(a, values);
      audit(user, 'update', 'admission', a.id);
    } else {
      throw new HttpError(400, 'Specify action: transfer or discharge, or update notes/diagnosis');
    }
    return joinAdmission(a);
  }]
];