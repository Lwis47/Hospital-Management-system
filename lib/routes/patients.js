'use strict';
const { db, save, uid, nextNum } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, today, nowISO, validateObject, validateString, validateTextFields, validateDate, validateEnum } = require('../util');

const ALL = '*';
const WRITE = ['admin', 'receptionist'];
const EDITABLE = ['firstName', 'lastName', 'dob', 'gender', 'phone', 'email', 'address', 'bloodGroup', 'allergies', 'insurance', 'emergencyContact'];

function validatePatient(body) {
  requireFields(body, ['firstName', 'lastName', 'dob', 'gender', 'phone']);
  const values = validateTextFields(body, ['firstName', 'lastName', 'phone', 'email', 'address', 'bloodGroup'], ['firstName', 'lastName', 'phone']);
  values.dob = validateDate(body.dob, 'Date of birth', { max: today() });
  values.gender = validateEnum(body.gender, 'gender', ['Male', 'Female', 'Other']);
  if (!Array.isArray(body.allergies)) throw new HttpError(400, 'Allergies must be a list');
  values.allergies = body.allergies.map(value => validateString(value, 'Allergy', true));
  for (const [field, key, texts] of [['insurance', 'provider', ['provider', 'policyNo']], ['emergencyContact', 'name', ['name', 'phone']]]) {
    if (body[field] === null) values[field] = null;
    else {
      validateObject(body[field], field);
      requireFields(body[field], [key]);
      values[field] = validateTextFields(body[field], texts, [key]);
    }
  }
  return values;
}

function findPatient(id) {
  const p = db.patients.find(x => x.id === id);
  if (!p) throw new HttpError(404, 'Patient not found');
  return p;
}

module.exports = [
  ['GET', '/api/patients', ALL, ({ query }) => {
    let list = db.patients;
    if (query.q) {
      const q = query.q.toLowerCase();
      list = list.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) || (p.phone || '').includes(q));
    }
    return list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }],

  ['POST', '/api/patients', WRITE, ({ user, body }) => {
    validateObject(body);
    const values = validatePatient({ email: '', address: '', bloodGroup: '', allergies: [], insurance: null, emergencyContact: null, ...body });
    const p = {
      id: uid('pat'), mrn: nextNum('mrn', 'MRN-'),
      ...values, createdAt: nowISO()
    };
    db.patients.push(p);
    audit(user, 'create', 'patient', p.id, `${p.firstName} ${p.lastName} (${p.mrn})`);
    return p;
  }],

  ['GET', '/api/patients/:id', ALL, ({ params }) => {
    const p = findPatient(params.id);
    return {
      ...p,
      encounters: db.encounters.filter(e => e.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      appointments: db.appointments.filter(a => a.patientId === p.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
      labOrders: db.labOrders.filter(l => l.patientId === p.id),
      admissions: db.admissions.filter(a => a.patientId === p.id),
      invoices: db.invoices.filter(i => i.patientId === p.id),
      dispenses: db.dispenses.filter(d => d.patientId === p.id)
    };
  }],

  ['PUT', '/api/patients/:id', WRITE, ({ user, params, body }) => {
    const p = findPatient(params.id);
    validateObject(body);
    const candidate = { email: '', address: '', bloodGroup: '', allergies: [], insurance: null, emergencyContact: null, ...p };
    for (const k of EDITABLE) if (body[k] !== undefined) candidate[k] = body[k];
    const values = validatePatient(candidate);
    for (const k of EDITABLE) if (body[k] !== undefined) p[k] = values[k];
    audit(user, 'update', 'patient', p.id);
    return p;
  }]
];