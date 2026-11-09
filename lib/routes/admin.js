'use strict';
const { db, save, uid } = require('../db');
const { audit, hashPassword, publicUser } = require('../auth');
const { HttpError, requireFields, today, addDays, nowISO, money, validateObject, validateString, validateTextFields, validateNumber, validateEnum, validateDate } = require('../util');

const ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'labtech', 'accountant'];

module.exports = [
  ['GET', '/api/users', ['admin'], () => db.users.map(publicUser)],

  ['POST', '/api/users', ['admin'], ({ user, body }) => {
    requireFields(body, ['username', 'password', 'name', 'role']);
    const username = validateString(body.username, 'Username', true);
    const values = validateTextFields(body, ['name', 'phone', 'department', 'specialization'], ['name']);
    const role = validateEnum(body.role, 'role', ROLES);
    if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 1024) throw new HttpError(400, 'Password must contain 6 to 1024 characters');
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, 'Username already exists');
    const fee = body.consultationFee === undefined ? 30 : money(validateNumber(body.consultationFee, 'Consultation fee'));
    const u = {
      id: uid('usr'), username, passwordHash: hashPassword(body.password),
      ...values, role, phone: values.phone || '', active: true, createdAt: nowISO()
    };
    if (role === 'doctor') {
      u.department = values.department || '';
      u.specialization = values.specialization || '';
      u.consultationFee = fee;
    }
    db.users.push(u);
    audit(user, 'create', 'user', u.id, `${u.username} (${u.role})`);
    return publicUser(u);
  }],

  ['PUT', '/api/users/:id', ['admin'], ({ user, params, body }) => {
    const u = db.users.find(x => x.id === params.id);
    if (!u) throw new HttpError(404, 'User not found');
    validateObject(body);
    const candidate = { ...u, ...validateTextFields(body, ['name', 'phone', 'department', 'specialization'], ['name']) };
    if (body.role !== undefined) candidate.role = validateEnum(body.role, 'role', ROLES);
    if (body.consultationFee !== undefined) candidate.consultationFee = money(validateNumber(body.consultationFee, 'Consultation fee'));
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw new HttpError(400, 'Account active must be a boolean');
      candidate.active = body.active;
    }
    if (u.id === user.id && !candidate.active) throw new HttpError(400, 'You cannot deactivate your own account');
    if (u.role === 'admin' && u.active && (!candidate.active || candidate.role !== 'admin') && !db.users.some(x => x.id !== u.id && x.role === 'admin' && x.active)) {
      throw new HttpError(409, 'The system must retain at least one active administrator');
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 1024) throw new HttpError(400, 'Password must contain 6 to 1024 characters');
      candidate.passwordHash = hashPassword(body.password);
    }
    Object.assign(u, candidate);
    audit(user, 'update', 'user', u.id, u.username);
    return publicUser(u);
  }],

  ['GET', '/api/departments', '*', () => db.departments],

  ['POST', '/api/departments', ['admin'], ({ user, body }) => {
    requireFields(body, ['name']);
    const name = validateString(body.name, 'Department name', true);
    if (db.departments.some(d => d.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'Department already exists');
    const d = { id: uid('dep'), name };
    db.departments.push(d);
    audit(user, 'create', 'department', d.id, d.name);
    return d;
  }],

  ['GET', '/api/audit', ['admin'], ({ query }) => {
    const limit = Math.min(Number(query.limit) || 200, 1000);
    return db.audit.slice(0, limit);
  }],

  ['GET', '/api/dashboard', '*', ({ user }) => {
    const t = today();
    const financial = ['admin', 'accountant', 'receptionist'].includes(user.role);
    const beds = db.beds;
    const apptsToday = db.appointments.filter(a => a.date === t && !['cancelled', 'no-show'].includes(a.status));
    const queue = apptsToday.filter(a => ['checked-in', 'in-consultation'].includes(a.status)).length;
    const openEncounters = db.encounters.filter(e => e.status === 'open').length;
    const admitted = db.admissions.filter(a => a.status === 'admitted').length;
    const pendingLabs = db.labOrders.filter(o => o.status !== 'completed').length;
    const lowStock = db.drugs.filter(d => d.stock <= d.reorderLevel).length;
    const unpaid = db.invoices.filter(i => i.status !== 'paid');
    const revenueToday = money(db.invoices.flatMap(i => i.payments).filter(p => today(new Date(p.date)) === t).reduce((s, p) => s + p.amount, 0));

    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const day = addDays(t, -i);
      trend.push({
        date: day,
        appointments: db.appointments.filter(a => a.date === day && !['cancelled', 'no-show'].includes(a.status)).length,
        encounters: db.encounters.filter(e => e.date === day).length,
        revenue: financial ? money(db.invoices.flatMap(x => x.payments).filter(p => today(new Date(p.date)) === day).reduce((s, p) => s + p.amount, 0)) : null
      });
    }
    return {
      stats: {
        patients: db.patients.length,
        appointmentsToday: apptsToday.length,
        queue, openEncounters, admitted,
        bedsTotal: beds.length,
        bedsAvailable: beds.filter(b => b.status === 'available').length,
        pendingLabs, lowStock,
        bedsOccupied: beds.filter(b => b.status === 'occupied').length,
        unpaidTotal: financial ? money(unpaid.reduce((s, i) => s + i.balance, 0)) : null,
        revenueToday: financial ? revenueToday : null
      },
      trend,
      recentActivity: (user.role === 'admin' ? db.audit : db.audit.filter(a => a.userId === user.id)).slice(0, 10)
    };
  }],

  ['GET', '/api/alerts', '*', ({ user }) => {
    const t = today();
    const soon = addDays(t, 30);
    return {
      lowStock: db.drugs.filter(d => d.stock <= d.reorderLevel).map(d => ({ id: d.id, name: d.name, stock: d.stock, reorderLevel: d.reorderLevel, unit: d.unit })),
      expiringSoon: db.drugs.filter(d => d.expiryDate && d.expiryDate <= soon).map(d => ({ id: d.id, name: d.name, expiryDate: d.expiryDate, batchNo: d.batchNo, expired: d.expiryDate < t })),
      pendingLabs: db.labOrders.filter(o => o.status !== 'completed').length,
      unpaidInvoices: db.invoices.filter(i => i.status !== 'paid' && ['admin', 'accountant', 'receptionist'].includes(user.role)).map(i => {
        const p = db.patients.find(x => x.id === i.patientId);
        return { id: i.id, number: i.number, patientName: p ? `${p.firstName} ${p.lastName}` : 'Unknown', balance: i.balance };
      })
    };
  }],

  ['GET', '/api/reports', ['admin', 'accountant'], ({ query }) => {
    const to = validateDate(query.to === undefined ? today() : query.to, 'Report end date');
    const from = validateDate(query.from === undefined ? addDays(to, -30) : query.from, 'Report start date', { max: to });
    const inRange = d => d >= from && d <= to;
    const invoices = db.invoices.filter(i => inRange(today(new Date(i.createdAt))));
    const allPayments = db.invoices.flatMap(i => i.payments).filter(p => inRange(today(new Date(p.date))));
    const byMethod = {};
    for (const p of allPayments) byMethod[p.method] = money((byMethod[p.method] || 0) + p.amount);
    const encounters = db.encounters.filter(e => inRange(e.date));
    const appointments = db.appointments.filter(a => inRange(a.date));
    const dispenses = db.dispenses.filter(d => inRange(today(new Date(d.date))));
    const topDrugs = {};
    for (const d of dispenses) {
      topDrugs[d.drugName] = topDrugs[d.drugName] || { name: d.drugName, qty: 0, revenue: 0 };
      topDrugs[d.drugName].qty += d.qty;
      topDrugs[d.drugName].revenue = money(topDrugs[d.drugName].revenue + d.total);
    }
    return {
      from, to,
      revenue: money(allPayments.reduce((s, p) => s + p.amount, 0)),
      paymentsByMethod: byMethod,
      invoicesIssued: invoices.length,
      billedTotal: money(invoices.reduce((s, i) => s + i.total, 0)),
      outstanding: money(db.invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.balance, 0)),
      encounters: encounters.length,
      appointments: appointments.length,
      labOrders: db.labOrders.filter(o => inRange(today(new Date(o.createdAt)))).length,
      admissions: db.admissions.filter(a => inRange(a.admitDate)).length,
      topDrugs: Object.values(topDrugs).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    };
  }]
];