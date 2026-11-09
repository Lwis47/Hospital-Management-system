'use strict';
const { db, save, uid } = require('../db');
const { audit } = require('../auth');
const { HttpError, requireFields, today, nowISO, validateObject, validateString, validateTextFields, validateNumber, validateEnum, optionalDate } = require('../util');
const { addBillItem } = require('./billing');

const CLINICAL = ['admin', 'doctor', 'nurse'];
const VITAL_KEYS = ['bp', 'pulse', 'temp', 'weight', 'height', 'spo2'];
const CLINICAL_FIELDS = ['doctorId', 'complaints', 'diagnosis', 'notes', 'followUpDate', 'prescriptions'];

function validateDoctor(id) {
  if (id === null) return null;
  const doctorId = validateString(id, 'doctorId', true);
  if (!db.users.some(u => u.id === doctorId && u.role === 'doctor' && u.active)) throw new HttpError(404, 'Active doctor not found');
  return doctorId;
}

function validateVitals(value) {
  validateObject(value, 'Vitals');
  const vitals = {};
  for (const key of VITAL_KEYS) {
    if (value[key] !== undefined) {
      // The existing vitals form submits numeric input values as strings.
      vitals[key] = key === 'bp' ? validateString(value[key], 'Blood pressure') : validateNumber(value[key], key, { allowString: true });
    }
  }
  return vitals;
}

function validatePrescriptions(items, encounter) {
  if (!Array.isArray(items)) throw new HttpError(400, 'Prescriptions must be a list');
  const dispensed = new Map();
  for (const item of encounter.prescriptions || []) {
    const count = validateNumber(item.dispensed === undefined ? 0 : item.dispensed, 'Dispensed quantity', { integer: true });
    dispensed.set(item.drugId, (dispensed.get(item.drugId) || 0) + count);
  }
  const recorded = new Map();
  for (const record of db.dispenses.filter(d => d.encounterId === encounter.id)) {
    recorded.set(record.drugId, (recorded.get(record.drugId) || 0) + validateNumber(record.qty, 'Dispensed quantity', { integer: true }));
  }
  for (const [id, count] of recorded) dispensed.set(id, Math.max(dispensed.get(id) || 0, count));
  const seen = new Set();
  const prescriptions = items.map(item => {
    requireFields(item, ['drugId', 'qty']);
    const drugId = validateString(item.drugId, 'drugId', true);
    if (seen.has(drugId)) throw new HttpError(400, 'Duplicate drugs are not allowed in a prescription');
    seen.add(drugId);
    const drug = db.drugs.find(d => d.id === drugId);
    if (!drug) throw new HttpError(404, `Drug not found: ${drugId}`);
    const qty = validateNumber(item.qty, 'Prescription quantity', { positive: true, integer: true });
    const count = validateNumber(dispensed.get(drugId) || 0, 'Dispensed quantity', { integer: true });
    if (qty < count) throw new HttpError(400, 'Prescription quantity cannot be less than already dispensed');
    const texts = validateTextFields(item, ['dose', 'frequency', 'duration', 'drugName']);
    if (item.dispensed !== undefined) validateNumber(item.dispensed, 'Dispensed quantity', { integer: true });
    return { drugId, drugName: drug.name, dose: texts.dose || '', frequency: texts.frequency || '', duration: texts.duration || '', qty, dispensed: count };
  });
  for (const [id, count] of dispensed) {
    if (count > 0 && !seen.has(id)) throw new HttpError(400, 'Cannot remove an already-dispensed prescription item');
  }
  return prescriptions;
}

function findEncounter(id) {
  const e = db.encounters.find(x => x.id === id);
  if (!e) throw new HttpError(404, 'Encounter not found');
  return e;
}

function joinEncounter(e) {
  const p = db.patients.find(x => x.id === e.patientId);
  const d = db.users.find(x => x.id === e.doctorId);
  return {
    ...e,
    patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown',
    patientMrn: p ? p.mrn : '', patientAllergies: p ? p.allergies : [],
    doctorName: d ? d.name : 'Unassigned'
  };
}

module.exports = [
  ['GET', '/api/encounters', CLINICAL, ({ query }) => {
    let list = db.encounters;
    if (query.patientId) list = list.filter(e => e.patientId === query.patientId);
    if (query.status) list = list.filter(e => e.status === query.status);
    if (query.date) list = list.filter(e => e.date === query.date);
    return list.map(joinEncounter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }],

  ['GET', '/api/encounters/:id', [...CLINICAL, 'pharmacist', 'labtech'], ({ params }) => {
    const e = findEncounter(params.id);
    return {
      ...joinEncounter(e),
      labOrders: db.labOrders.filter(l => l.encounterId === e.id),
      dispenses: db.dispenses.filter(d => d.encounterId === e.id)
    };
  }],

  ['POST', '/api/encounters', ['admin', 'doctor', 'nurse'], ({ user, body }) => {
    requireFields(body, ['patientId']);
    const patientId = validateString(body.patientId, 'patientId', true);
    const patient = db.patients.find(p => p.id === patientId);
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (user.role === 'nurse' && (body.prescriptions !== undefined || body.status === 'closed')) throw new HttpError(403, 'Only a doctor or admin can close or prescribe');
    const texts = validateTextFields(body, ['complaints', 'diagnosis', 'notes']);
    const type = body.type === undefined ? 'outpatient' : validateEnum(body.type, 'encounter type', ['inpatient', 'outpatient']);
    if (body.status !== undefined) validateEnum(body.status, 'new encounter status', ['open']);
    if (body.followUpDate !== undefined) optionalDate(body.followUpDate, 'Follow-up date', { min: today() });
    if (body.prescriptions !== undefined) {
      if (!Array.isArray(body.prescriptions) || body.prescriptions.length) throw new HttpError(400, 'Add prescriptions by updating the encounter');
    }
    let doctorId = body.doctorId === undefined ? (user.role === 'doctor' ? user.id : null) : validateDoctor(body.doctorId);
    let appt = null;
    if (body.appointmentId !== undefined && body.appointmentId !== null) {
      const appointmentId = validateString(body.appointmentId, 'appointmentId', true);
      appt = db.appointments.find(a => a.id === appointmentId);
      if (!appt) throw new HttpError(404, 'Appointment not found');
      if (appt.patientId !== patientId) throw new HttpError(400, 'Appointment belongs to a different patient');
      if (!['scheduled', 'checked-in'].includes(appt.status)) throw new HttpError(409, 'Appointment cannot start a new encounter in its current state');
      if (appt.date !== today()) throw new HttpError(400, 'Can only start an appointment encounter on its scheduled day');
      if (db.encounters.some(e => e.appointmentId === appt.id)) throw new HttpError(409, 'Appointment already has an encounter');
      if (body.doctorId !== undefined && body.doctorId !== null && doctorId !== appt.doctorId) throw new HttpError(400, 'Doctor does not match appointment');
      doctorId = appt.doctorId;
    }
    doctorId = validateDoctor(doctorId);
    const vitals = body.vitals === undefined ? {} : validateVitals(body.vitals);
    const e = {
      id: uid('enc'), patientId, doctorId,
      appointmentId: appt ? appt.id : null,
      type, date: today(), vitals,
      complaints: texts.complaints || '', diagnosis: '', notes: '',
      prescriptions: [], labOrderIds: [], status: 'open',
      followUpDate: null, billed: false, createdAt: nowISO()
    };
    db.encounters.push(e);
    if (appt && ['scheduled', 'checked-in'].includes(appt.status)) appt.status = 'in-consultation';
    audit(user, 'create', 'encounter', e.id, patient.mrn);
    return joinEncounter(e);
  }],

  ['PUT', '/api/encounters/:id', ['admin', 'doctor', 'nurse'], ({ user, params, body }) => {
    const e = findEncounter(params.id);
    if (e.status === 'closed') throw new HttpError(409, 'Encounter is closed and can no longer be edited');
    validateObject(body);
    if (user.role === 'nurse' && (CLINICAL_FIELDS.some(key => body[key] !== undefined) || body.status === 'closed')) {
      throw new HttpError(403, 'Only a doctor or admin can edit clinical notes, close or prescribe');
    }
    const candidate = { ...e, ...validateTextFields(body, ['complaints', 'diagnosis', 'notes']) };
    if (body.vitals !== undefined) candidate.vitals = { ...e.vitals, ...validateVitals(body.vitals) };
    candidate.doctorId = validateDoctor(body.doctorId === undefined ? (e.doctorId || null) : body.doctorId);
    if (body.followUpDate !== undefined) candidate.followUpDate = optionalDate(body.followUpDate, 'Follow-up date', { min: e.date });
    if (body.prescriptions !== undefined) candidate.prescriptions = validatePrescriptions(body.prescriptions, e);
    if (body.status !== undefined) candidate.status = validateEnum(body.status, 'encounter status', ['open', 'closed']);
    let appt = null;
    if (candidate.status === 'closed') {
      validateString(candidate.diagnosis, 'Diagnosis', true);
      candidate.closedAt = nowISO();
      if (e.appointmentId) {
        appt = db.appointments.find(a => a.id === e.appointmentId);
        if (!appt || !['checked-in', 'in-consultation'].includes(appt.status)) throw new HttpError(409, 'Appointment is not in consultation');
      }
      if (!e.billed) {
        const doctor = db.users.find(u => u.id === candidate.doctorId);
        const fee = doctor && doctor.consultationFee !== undefined ? doctor.consultationFee : 30;
        addBillItem(e.patientId, { desc: `Consultation — ${doctor ? doctor.name : 'Physician'} (${e.date})`, qty: 1, price: fee }, user);
        candidate.billed = true;
      }
    }
    Object.assign(e, candidate);
    if (appt) appt.status = 'completed';
    audit(user, 'update', 'encounter', e.id, e.status);
    return joinEncounter(e);
  }]
];