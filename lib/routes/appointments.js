'use strict';
const { db, save, uid } = require('../db');
const { audit, publicUser } = require('../auth');
const { HttpError, requireFields, today, nowISO, validateObject, validateString, validateDate, validateTime, validateEnum } = require('../util');

const ACTIVE_STATUSES = ['scheduled', 'checked-in', 'in-consultation'];
const TRANSITIONS = {
  scheduled: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['cancelled'],
  'in-consultation': ['completed']
};

function validateSchedule(date, time) {
  validateDate(date, 'Appointment date');
  validateTime(time);
  const scheduled = new Date(`${date}T${time}:00`);
  if (scheduled.getFullYear() !== Number(date.slice(0, 4)) || scheduled.getMonth() + 1 !== Number(date.slice(5, 7)) ||
      scheduled.getDate() !== Number(date.slice(8, 10)) || scheduled.getHours() !== Number(time.slice(0, 2)) ||
      scheduled.getMinutes() !== Number(time.slice(3, 5))) throw new HttpError(400, 'Invalid local appointment time');
  if (scheduled.getTime() < Date.now()) throw new HttpError(400, 'Appointment cannot be scheduled in the past');
}

function checkConflict(doctorId, date, time, id) {
  if (db.appointments.some(a => a.id !== id && a.doctorId === doctorId && a.date === date && a.time === time && ACTIVE_STATUSES.includes(a.status))) {
    throw new HttpError(409, 'Doctor already has an appointment at that date and time');
  }
}

function joinAppt(a) {
  const p = db.patients.find(x => x.id === a.patientId);
  const d = db.users.find(x => x.id === a.doctorId);
  return { ...a, patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '', doctorName: d ? d.name : 'Unknown' };
}

module.exports = [
  ['GET', '/api/doctors', '*', () =>
    db.users.filter(u => u.role === 'doctor' && u.active).map(publicUser)],

  ['GET', '/api/appointments', '*', ({ query }) => {
    let list = db.appointments;
    if (query.date) list = list.filter(a => a.date === query.date);
    if (query.doctorId) list = list.filter(a => a.doctorId === query.doctorId);
    if (query.patientId) list = list.filter(a => a.patientId === query.patientId);
    if (query.status) list = list.filter(a => a.status === query.status);
    return list.map(joinAppt).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }],

  ['POST', '/api/appointments', ['admin', 'receptionist', 'doctor'], ({ user, body }) => {
    requireFields(body, ['patientId', 'doctorId', 'date', 'time']);
    const patientId = validateString(body.patientId, 'patientId', true);
    const doctorId = validateString(body.doctorId, 'doctorId', true);
    const reason = body.reason === undefined ? '' : validateString(body.reason, 'Reason');
    validateSchedule(body.date, body.time);
    if (!db.patients.some(p => p.id === patientId)) throw new HttpError(404, 'Patient not found');
    const doctor = db.users.find(u => u.id === doctorId && u.role === 'doctor' && u.active);
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    checkConflict(doctorId, body.date, body.time);
    const a = {
      id: uid('apt'), patientId, doctorId,
      date: body.date, time: body.time, reason,
      status: 'scheduled', createdAt: nowISO()
    };
    db.appointments.push(a);
    audit(user, 'create', 'appointment', a.id, `${body.date} ${body.time} with ${doctor.name}`);
    return joinAppt(a);
  }],

  ['PUT', '/api/appointments/:id', ['admin', 'receptionist', 'doctor', 'nurse'], ({ user, params, body }) => {
    const a = db.appointments.find(x => x.id === params.id);
    if (!a) throw new HttpError(404, 'Appointment not found');
    validateObject(body);
    const candidate = { ...a };
    if (body.reason !== undefined) candidate.reason = validateString(body.reason, 'Reason');
    if (body.date !== undefined || body.time !== undefined) {
      if (a.status !== 'scheduled' || db.encounters.some(e => e.appointmentId === a.id)) throw new HttpError(409, 'Only unstarted scheduled appointments can be rescheduled');
      candidate.date = body.date === undefined ? a.date : body.date;
      candidate.time = body.time === undefined ? a.time : body.time;
      validateSchedule(candidate.date, candidate.time);
      if (!db.users.some(u => u.id === a.doctorId && u.role === 'doctor' && u.active)) throw new HttpError(404, 'Doctor not found');
      checkConflict(a.doctorId, candidate.date, candidate.time, a.id);
    }
    if (body.status !== undefined) {
      validateEnum(body.status, 'appointment status', ['scheduled', 'checked-in', 'cancelled', 'no-show', 'completed']);
      if (!(TRANSITIONS[a.status] || []).includes(body.status)) throw new HttpError(409, `Cannot move from ${a.status} to ${body.status}`);
      if (body.status === 'checked-in' && candidate.date !== today()) throw new HttpError(400, 'Can only check in appointments for today');
      if (body.status === 'no-show' && candidate.date > today()) throw new HttpError(400, 'Cannot mark a future appointment as no-show');
      if (body.status === 'completed' && !db.encounters.some(e => e.appointmentId === a.id && e.status === 'closed')) {
        throw new HttpError(409, 'Close the associated encounter to complete the appointment');
      }
      candidate.status = body.status;
    }
    Object.assign(a, candidate);
    audit(user, 'update', 'appointment', a.id, a.status);
    return joinAppt(a);
  }],

  ['GET', '/api/queue', ['admin', 'doctor', 'nurse', 'receptionist'], ({ query }) => {
    const date = query.date || today();
    const appts = db.appointments
      .filter(a => a.date === date && ['checked-in', 'in-consultation'].includes(a.status))
      .map(a => {
        const enc = db.encounters.find(e => e.appointmentId === a.id && e.status === 'open');
        return { ...joinAppt(a), encounterId: enc ? enc.id : null };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
    const walkIns = db.encounters
      .filter(e => e.date === date && e.status === 'open' && !e.appointmentId && e.type === 'outpatient')
      .map(e => {
        const p = db.patients.find(x => x.id === e.patientId);
        const d = db.users.find(x => x.id === e.doctorId);
        return { id: e.id, encounterId: e.id, patientId: e.patientId, patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', patientMrn: p ? p.mrn : '', doctorId: e.doctorId, doctorName: d ? d.name : 'Unassigned', time: e.createdAt.slice(11, 16), reason: e.complaints || 'Walk-in', status: 'walk-in' };
      });
    return [...appts, ...walkIns];
  }]
];