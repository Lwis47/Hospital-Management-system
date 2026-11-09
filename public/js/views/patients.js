import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, searchBox, icon, fmtDate, fmtMoney, fmtDateTime, age, patientLabel, todayStr } from '../ui.js';

const canWrite = user => ['admin', 'receptionist'].includes(user.role);

export async function render(root, ctx) {
  if (ctx.params[0]) return renderDetail(root, ctx, ctx.params[0]);
  let patients = await GET('/api/patients');

  const head = h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Patients'), h('div', { class: 'page-sub' }, `${patients.length} registered patients`)),
    canWrite(ctx.user) ? h('button', { class: 'btn btn-primary', onclick: () => registerPatient(load) }, icon('plus'), 'Register Patient') : null);

  const tableHolder = h('div');
  const toolbar = h('div', { class: 'toolbar' },
    searchBox('Search by name, MRN or phone…', async q => {
      patients = await GET('/api/patients?q=' + encodeURIComponent(q));
      draw();
    }));

  function draw() {
    clear(tableHolder);
    tableHolder.appendChild(card(null, table([
      { label: 'MRN', render: p => h('span', { class: 'td-main' }, p.mrn) },
      { label: 'Patient', render: p => h('div', null, h('div', { class: 'td-main' }, `${p.firstName} ${p.lastName}`), h('div', { class: 'td-sub' }, `${age(p.dob)} yrs · ${p.gender}`)) },
      { label: 'Phone', key: 'phone' },
      { label: 'Blood', render: p => p.bloodGroup || '—' },
      { label: 'Allergies', render: p => p.allergies.length ? h('span', { class: 'badge b-red' }, p.allergies.join(', ')) : h('span', { class: 'td-sub' }, 'None') },
      { label: 'Insurance', render: p => p.insurance ? p.insurance.provider : h('span', { class: 'td-sub' }, 'Self-pay') },
      { label: 'Registered', render: p => fmtDate(p.createdAt) }
    ], patients, { onRowClick: p => ctx.navigate('patients/' + p.id), emptyText: 'No patients match your search' }), { flush: true }));
  }

  async function load() {
    patients = await GET('/api/patients');
    draw();
  }

  draw();
  root.appendChild(head);
  root.appendChild(toolbar);
  root.appendChild(tableHolder);
}

function registerPatient(onDone) {
  formModal('Register New Patient', [
    { name: 'firstName', label: 'First name', required: true },
    { name: 'lastName', label: 'Last name', required: true },
    { name: 'dob', label: 'Date of birth', type: 'date', required: true },
    { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
    { name: 'phone', label: 'Phone', required: true, placeholder: '07xxxxxxxx' },
    { name: 'email', label: 'Email', type: 'email', required: false },
    { name: 'bloodGroup', label: 'Blood group', type: 'select', options: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], required: false, placeholder: false },
    { name: 'address', label: 'Address', required: false, full: true },
    { name: 'allergies', label: 'Known allergies', required: false, full: true, placeholder: 'Comma-separated, e.g. Penicillin, Sulfa drugs' },
    { name: 'insuranceProvider', label: 'Insurance provider', required: false },
    { name: 'policyNo', label: 'Policy number', required: false },
    { name: 'ecName', label: 'Emergency contact name', required: false },
    { name: 'ecPhone', label: 'Emergency contact phone', required: false }
  ], async v => {
    const p = await POST('/api/patients', {
      ...v,
      allergies: v.allergies ? v.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
      insurance: v.insuranceProvider ? { provider: v.insuranceProvider, policyNo: v.policyNo } : null,
      emergencyContact: v.ecName ? { name: v.ecName, phone: v.ecPhone } : null
    });
    toast(`Patient registered — MRN ${p.mrn}`);
    onDone && onDone();
  }, { twoCol: true, wide: true, submitLabel: 'Register Patient' });
}

async function renderDetail(root, ctx, id) {
  const p = await GET('/api/patients/' + id).catch(err => {
    root.appendChild(h('div', { class: 'empty' }, err.message));
    return null;
  });
  if (!p) return;

  root.appendChild(h('button', { class: 'back-link', onclick: () => ctx.navigate('patients') }, icon('arrowLeft'), 'All patients'));
  root.appendChild(h('div', { class: 'page-head' },
    h('div', null,
      h('div', { class: 'page-title' }, `${p.firstName} ${p.lastName}`),
      h('div', { class: 'page-sub' }, `${p.mrn} · ${age(p.dob)} yrs · ${p.gender} · Blood ${p.bloodGroup || 'unknown'}`)),
    canWrite(ctx.user) ? h('button', { class: 'btn btn-outline', onclick: () => editPatient(p, () => ctx.navigate('patients/' + id)) }, icon('edit'), 'Edit') : null));

  if (p.allergies.length) root.appendChild(h('div', { class: 'allergy-warn', style: { marginBottom: '16px' } }, `Allergies: ${p.allergies.join(', ')}`));

  const info = h('dl', { class: 'kv' },
    h('dt', {}, 'Phone'), h('dd', {}, p.phone),
    h('dt', {}, 'Email'), h('dd', {}, p.email || '—'),
    h('dt', {}, 'Address'), h('dd', {}, p.address || '—'),
    h('dt', {}, 'Date of birth'), h('dd', {}, fmtDate(p.dob)),
    h('dt', {}, 'Insurance'), h('dd', {}, p.insurance ? `${p.insurance.provider} (${p.insurance.policyNo})` : 'Self-pay'),
    h('dt', {}, 'Emergency contact'), h('dd', {}, p.emergencyContact ? `${p.emergencyContact.name} — ${p.emergencyContact.phone}` : '—'),
    h('dt', {}, 'Registered'), h('dd', {}, fmtDate(p.createdAt)));

  const encs = table([
    { label: 'Date', render: e => fmtDate(e.date) },
    { label: 'Type', render: e => badge(e.type === 'inpatient' ? 'admitted' : 'scheduled', e.type) },
    { label: 'Diagnosis', render: e => e.diagnosis || h('span', { class: 'td-sub' }, 'pending') },
    { label: 'Status', render: e => badge(e.status) }
  ], p.encounters);

  const appts = table([
    { label: 'Date', render: a => `${fmtDate(a.date)} ${a.time}` },
    { label: 'Reason', key: 'reason' },
    { label: 'Status', render: a => badge(a.status) }
  ], p.appointments.slice(0, 10));

  const labs = table([
    { label: 'Ordered', render: l => fmtDate(l.createdAt) },
    { label: 'Status', render: l => badge(l.status) },
    { label: 'Result', render: l => l.result || '—' }
  ], p.labOrders);

  const invs = table([
    { label: 'Invoice', render: i => h('span', { class: 'td-main' }, i.number) },
    { label: 'Total', num: true, render: i => fmtMoney(i.total) },
    { label: 'Balance', num: true, render: i => fmtMoney(i.balance) },
    { label: 'Status', render: i => badge(i.status) }
  ], p.invoices);

  const adms = table([
    { label: 'Admitted', render: a => fmtDate(a.admitDate) },
    { label: 'Discharged', render: a => a.dischargeDate ? fmtDate(a.dischargeDate) : '—' },
    { label: 'Diagnosis', key: 'diagnosis' },
    { label: 'Status', render: a => badge(a.status) }
  ], p.admissions);

  root.appendChild(h('div', { class: 'grid-3-1' },
    card('Patient profile', info),
    card('Summary', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' } },
      h('div', null, h('b', {}, p.encounters.length), ' clinical encounter(s)'),
      h('div', null, h('b', {}, p.labOrders.length), ' lab order(s)'),
      h('div', null, h('b', {}, p.admissions.length), ' admission(s)'),
      h('div', null, h('b', {}, fmtMoney(p.invoices.reduce((s, i) => s + i.balance, 0))), ' outstanding balance')))));
  root.appendChild(h('div', { class: 'section-title' }, 'Clinical encounters'));
  root.appendChild(card(null, encs, { flush: true }));
  root.appendChild(h('div', { class: 'grid-2', style: { marginTop: '16px' } },
    card('Appointments', appts, { flush: true }),
    card('Lab orders', labs, { flush: true })));
  root.appendChild(h('div', { class: 'grid-2', style: { marginTop: '16px' } },
    card('Invoices', invs, { flush: true }),
    card('Admissions', adms, { flush: true })));
}

function editPatient(p, onDone) {
  formModal('Edit Patient — ' + p.mrn, [
    { name: 'firstName', label: 'First name', value: p.firstName },
    { name: 'lastName', label: 'Last name', value: p.lastName },
    { name: 'dob', label: 'Date of birth', type: 'date', value: p.dob },
    { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], value: p.gender },
    { name: 'phone', label: 'Phone', value: p.phone },
    { name: 'email', label: 'Email', value: p.email, required: false },
    { name: 'bloodGroup', label: 'Blood group', type: 'select', options: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], value: p.bloodGroup, required: false, placeholder: false },
    { name: 'address', label: 'Address', value: p.address, required: false, full: true },
    { name: 'allergies', label: 'Known allergies', value: p.allergies.join(', '), required: false, full: true },
    { name: 'insuranceProvider', label: 'Insurance provider', value: p.insurance?.provider || '', required: false },
    { name: 'policyNo', label: 'Policy number', value: p.insurance?.policyNo || '', required: false }
  ], async v => {
    await PUT('/api/patients/' + p.id, {
      ...v,
      allergies: v.allergies ? v.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
      insurance: v.insuranceProvider ? { provider: v.insuranceProvider, policyNo: v.policyNo } : null
    });
    toast('Patient updated');
    onDone();
  }, { twoCol: true, wide: true });
}