import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, confirmModal, icon, fmtDate, todayStr, patientLabel } from '../ui.js';

const canBook = user => ['admin', 'receptionist', 'doctor'].includes(user.role);
const canUpdate = user => ['admin', 'receptionist', 'doctor', 'nurse'].includes(user.role);

export async function render(root, ctx) {
  let date = todayStr();
  let doctorId = '';
  const doctors = await GET('/api/doctors');

  const dateInput = h('input', { type: 'date', value: date });
  dateInput.addEventListener('change', () => { date = dateInput.value; load(); });
  const docSelect = h('select', null,
    h('option', { value: '' }, 'All doctors'),
    doctors.map(d => h('option', { value: d.id }, d.name)));
  docSelect.addEventListener('change', () => { doctorId = docSelect.value; load(); });

  const holder = h('div');
  const toolbar = h('div', { class: 'toolbar' },
    dateInput, docSelect,
    h('button', { class: 'btn btn-outline btn-sm', onclick: () => { date = todayStr(); dateInput.value = date; load(); } }, 'Today'),
    h('div', { class: 'spacer' }),
    canBook(ctx.user) ? h('button', { class: 'btn btn-primary', onclick: () => bookAppointment(ctx, load) }, icon('plus'), 'New Appointment') : null);

  async function load() {
    let list = await GET(`/api/appointments?date=${date}${doctorId ? '&doctorId=' + doctorId : ''}`);
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Time', render: a => h('span', { class: 'td-main' }, a.time) },
      { label: 'Patient', render: a => h('div', null, h('div', { class: 'td-main' }, a.patientName), h('div', { class: 'td-sub' }, a.patientMrn)) },
      { label: 'Doctor', key: 'doctorName' },
      { label: 'Reason', key: 'reason' },
      { label: 'Status', render: a => badge(a.status) },
      { label: 'Actions', render: a => actions(a) }
    ], list, { emptyText: 'No appointments for this date' }), { flush: true }));
  }

  function actions(a) {
    const row = h('div', { class: 'btn-row' });
    if (!canUpdate(ctx.user) || ['completed', 'cancelled', 'no-show'].includes(a.status)) return row;
    if (a.status === 'scheduled' && a.date === todayStr()) {
      row.appendChild(h('button', { class: 'btn btn-primary btn-sm', onclick: () => setStatus(a, 'checked-in') }, 'Check in'));
    }
    if (['scheduled', 'checked-in'].includes(a.status)) {
      row.appendChild(h('button', { class: 'btn btn-outline btn-sm', onclick: async () => { if (await confirmModal(`Cancel appointment for ${a.patientName} at ${a.time}?`)) setStatus(a, 'cancelled'); } }, 'Cancel'));
      if (a.date === todayStr() && a.status === 'scheduled') {
        row.appendChild(h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setStatus(a, 'no-show') }, 'No-show'));
      }
    }
    return row;
  }

  async function setStatus(a, status) {
    try {
      await PUT('/api/appointments/' + a.id, { status });
      toast(`Appointment ${status.replace('-', ' ')}`);
      load();
    } catch (err) { toast(err.message, 'error'); }
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Appointments'), h('div', { class: 'page-sub' }, 'Schedule and manage patient visits'))));
  root.appendChild(toolbar);
  root.appendChild(holder);
  await load();
}

async function bookAppointment(ctx, onDone) {
  const [patients, doctors] = await Promise.all([GET('/api/patients'), GET('/api/doctors')]);
  formModal('Book Appointment', [
    { name: 'patientId', label: 'Patient', type: 'select', options: patients.map(p => ({ value: p.id, label: patientLabel(p) })), full: true },
    { name: 'doctorId', label: 'Doctor', type: 'select', options: doctors.map(d => ({ value: d.id, label: `${d.name} — ${d.specialization || d.department || 'Physician'}` })), full: true },
    { name: 'date', label: 'Date', type: 'date', value: todayStr(), min: todayStr() },
    { name: 'time', label: 'Time', type: 'time', value: '09:00' },
    { name: 'reason', label: 'Reason / symptoms', type: 'textarea', required: false, full: true }
  ], async v => {
    await POST('/api/appointments', v);
    toast('Appointment booked');
    onDone();
  }, { twoCol: true, submitLabel: 'Book Appointment' });
}