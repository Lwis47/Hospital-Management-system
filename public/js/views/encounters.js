import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, confirmModal, icon, fmtDate, todayStr, patientLabel } from '../ui.js';

const isDoctor = user => ['admin', 'doctor'].includes(user.role);

export async function render(root, ctx) {
  if (ctx.params[0]) return renderWorkspace(root, ctx, ctx.params[0]);

  let status = 'open';
  const holder = h('div');
  async function load() {
    const list = await GET('/api/encounters' + (status ? '?status=' + status : ''));
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Date', render: e => fmtDate(e.date) },
      { label: 'Patient', render: e => h('div', null, h('div', { class: 'td-main' }, e.patientName), h('div', { class: 'td-sub' }, e.patientMrn)) },
      { label: 'Doctor', key: 'doctorName' },
      { label: 'Complaints', render: e => e.complaints || '—' },
      { label: 'Diagnosis', render: e => e.diagnosis || h('span', { class: 'td-sub' }, 'pending') },
      { label: 'Status', render: e => badge(e.status) }
    ], list, { onRowClick: e => ctx.navigate('encounters/' + e.id), emptyText: 'No encounters found' }), { flush: true }));
  }

  const tabsBar = h('div', { class: 'tabs' },
    ['open', 'closed', ''].map(s => h('button', {
      class: 'tab' + (s === status ? ' active' : ''),
      onclick: ev => { status = s; tabsBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); ev.target.classList.add('active'); load(); }
    }, s === 'open' ? 'Open' : s === 'closed' ? 'Closed' : 'All')));

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Consultations / EMR'), h('div', { class: 'page-sub' }, 'Electronic medical records and clinical encounters')),
    h('button', { class: 'btn btn-primary', onclick: () => newEncounter(ctx, load) }, icon('plus'), 'New Walk-in Encounter')));
  root.appendChild(tabsBar);
  root.appendChild(holder);
  await load();
}

async function newEncounter(ctx, onDone) {
  const [patients, doctors] = await Promise.all([GET('/api/patients'), GET('/api/doctors')]);
  formModal('New Walk-in Encounter', [
    { name: 'patientId', label: 'Patient', type: 'select', options: patients.map(p => ({ value: p.id, label: patientLabel(p) })), full: true },
    { name: 'doctorId', label: 'Attending doctor', type: 'select', options: doctors.map(d => ({ value: d.id, label: d.name })), value: ctx.user.role === 'doctor' ? ctx.user.id : '', full: true },
    { name: 'complaints', label: 'Presenting complaints', type: 'textarea', required: false, full: true }
  ], async v => {
    const enc = await POST('/api/encounters', v);
    toast('Encounter opened');
    ctx.navigate('encounters/' + enc.id);
  }, { submitLabel: 'Open Encounter' });
}

async function renderWorkspace(root, ctx, id) {
  let enc;
  try { enc = await GET('/api/encounters/' + id); }
  catch (err) { root.appendChild(h('div', { class: 'empty' }, err.message)); return; }

  const [drugs, labTests] = await Promise.all([GET('/api/drugs'), GET('/api/labtests')]);
  const doctor = isDoctor(ctx.user);
  const closed = enc.status === 'closed';
  const reload = () => { clear(root); renderWorkspace(root, ctx, id); };

  root.appendChild(h('button', { class: 'back-link', onclick: () => ctx.navigate('encounters') }, icon('arrowLeft'), 'All encounters'));
  root.appendChild(h('div', { class: 'page-head' },
    h('div', null,
      h('div', { class: 'enc-patient-name' }, enc.patientName, ' ', badge(enc.status)),
      h('div', { class: 'page-sub' }, `${enc.patientMrn} · ${enc.type} · ${fmtDate(enc.date)} · ${enc.doctorName}`)),
    !closed && doctor ? h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        if (!diagInput.value.trim()) { toast('Enter a diagnosis before closing the encounter', 'error'); return; }
        if (!(await confirmModal('Close this encounter? The consultation fee will be billed to the patient and the record becomes read-only.'))) return;
        try {
          await saveAll(true);
          toast('Encounter closed and consultation billed');
          reload();
        } catch (err) { toast(err.message, 'error'); }
      }
    }, icon('check'), 'Close Encounter') : null));

  if (enc.patientAllergies && enc.patientAllergies.length) {
    root.appendChild(h('div', { class: 'allergy-warn', style: { marginBottom: '16px' } }, `ALLERGIES: ${enc.patientAllergies.join(', ')}`));
  }

  // ----- Vitals -----
  const v = enc.vitals || {};
  const vitalDefs = [['bp', 'BP (mmHg)', 'text', '120/80'], ['pulse', 'Pulse (bpm)', 'number', '72'], ['temp', 'Temp (°C)', 'number', '36.6'], ['weight', 'Weight (kg)', 'number', '70'], ['height', 'Height (cm)', 'number', '170'], ['spo2', 'SpO2 (%)', 'number', '98']];
  const vitalInputs = {};
  const vitalsGrid = h('div', { class: 'vitals-grid' }, vitalDefs.map(([key, label, type, ph]) => {
    const input = h('input', { type, step: 'any', value: v[key] ?? '', placeholder: ph, disabled: closed });
    vitalInputs[key] = input;
    return h('div', { class: 'field', style: { marginBottom: '0' } }, h('label', {}, label), input);
  }));
  const vitalsCard = card('Vitals', h('div', null, vitalsGrid,
    !closed ? h('div', { style: { marginTop: '12px' } }, h('button', {
      class: 'btn btn-outline btn-sm',
      onclick: async () => {
        const vitals = {};
        for (const [k] of vitalDefs) if (vitalInputs[k].value !== '') vitals[k] = vitalInputs[k].value;
        try { await PUT('/api/encounters/' + id, { vitals }); toast('Vitals saved'); } catch (err) { toast(err.message, 'error'); }
      }
    }, 'Save Vitals')) : null));

  // ----- Clinical notes -----
  const complaintsInput = h('textarea', { disabled: closed || !doctor }, enc.complaints || '');
  const diagInput = h('textarea', { disabled: closed || !doctor, placeholder: 'Final diagnosis (required to close)' }, enc.diagnosis || '');
  const notesInput = h('textarea', { disabled: closed || !doctor, placeholder: 'Examination findings, treatment plan…' }, enc.notes || '');
  const followInput = h('input', { type: 'date', value: enc.followUpDate || '', disabled: closed || !doctor });

  // ----- Prescriptions -----
  const rxHolder = h('div');
  let rxRows = enc.prescriptions.map(p => ({ ...p }));
  function drawRx() {
    clear(rxHolder);
    rxRows.forEach((row, i) => {
      const drugSel = h('select', { disabled: closed || !doctor },
        h('option', { value: '' }, 'Select drug…'),
        drugs.map(d => h('option', { value: d.id, selected: d.id === row.drugId }, `${d.name} (stock: ${d.stock})`)));
      drugSel.addEventListener('change', () => { row.drugId = drugSel.value; });
      const mk = (key, ph, val, width) => {
        const inp = h('input', { placeholder: ph, value: val ?? '', disabled: closed || !doctor, style: width ? { width } : {} });
        inp.addEventListener('input', () => { row[key] = inp.value; });
        return inp;
      };
      const qty = h('input', { type: 'number', min: '1', value: row.qty ?? 1, disabled: closed || !doctor });
      qty.addEventListener('input', () => { row.qty = Number(qty.value); });
      rxHolder.appendChild(h('div', { class: 'rx-row' },
        drugSel, mk('dose', 'Dose: 1 tab', row.dose), mk('frequency', 'Freq: 3x daily', row.frequency),
        mk('duration', 'Duration: 5 days', row.duration), qty,
        !closed && doctor ? h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { rxRows.splice(i, 1); drawRx(); } }, icon('x')) : h('span')));
      if (row.dispensed) {
        rxHolder.appendChild(h('div', { class: 'td-sub', style: { margin: '-4px 0 8px' } }, `${row.dispensed} of ${row.qty} already dispensed`));
      }
    });
    if (!rxRows.length) rxHolder.appendChild(h('div', { class: 'td-sub', style: { padding: '6px 0' } }, 'No prescriptions yet'));
    if (!closed && doctor) {
      rxHolder.appendChild(h('button', { class: 'btn btn-outline btn-sm', style: { marginTop: '6px' }, onclick: () => { rxRows.push({ drugId: '', dose: '', frequency: '', duration: '', qty: 1 }); drawRx(); } }, icon('plus'), 'Add Drug'));
    }
  }
  drawRx();

  // ----- Lab orders -----
  const labHolder = h('div');
  async function drawLabs() {
    const orders = await GET('/api/laborders?encounterId=' + id);
    clear(labHolder);
    labHolder.appendChild(table([
      { label: 'Test', render: o => h('span', { class: 'td-main' }, o.testName) },
      { label: 'Status', render: o => badge(o.status) },
      { label: 'Result', render: o => o.result || '—' },
      { label: 'Ordered', render: o => fmtDate(o.createdAt) }
    ], orders, { emptyText: 'No lab tests ordered' }));
    if (!closed && doctor) {
      const testSel = h('select', null, h('option', { value: '' }, 'Select test…'), labTests.map(t => h('option', { value: t.id }, `${t.name} — $${t.price}`)));
      const notes = h('input', { placeholder: 'Clinical notes (optional)', style: { flex: '1' } });
      labHolder.appendChild(h('div', { class: 'toolbar', style: { marginTop: '12px', marginBottom: '0' } },
        testSel, notes,
        h('button', {
          class: 'btn btn-outline btn-sm',
          onclick: async () => {
            if (!testSel.value) { toast('Select a test first', 'error'); return; }
            try {
              await POST('/api/laborders', { patientId: enc.patientId, testId: testSel.value, encounterId: id, notes: notes.value });
              toast('Lab test ordered');
              drawLabs();
            } catch (err) { toast(err.message, 'error'); }
          }
        }, icon('flask'), 'Order Test')));
    }
  }

  async function saveAll(close = false) {
    const vitals = {};
    for (const [k] of vitalDefs) if (vitalInputs[k].value !== '') vitals[k] = vitalInputs[k].value;
    const payload = { vitals };
    if (doctor) {
      payload.complaints = complaintsInput.value;
      payload.diagnosis = diagInput.value;
      payload.notes = notesInput.value;
      payload.followUpDate = followInput.value || null;
      payload.prescriptions = rxRows.filter(r => r.drugId && Number(r.qty) > 0);
      if (close) payload.status = 'closed';
    }
    await PUT('/api/encounters/' + id, payload);
  }

  const notesCard = card('Clinical Notes', h('div', null,
    h('div', { class: 'field' }, h('label', {}, 'Presenting complaints'), complaintsInput),
    h('div', { class: 'field' }, h('label', {}, 'Diagnosis'), diagInput),
    h('div', { class: 'field' }, h('label', {}, 'Examination / plan notes'), notesInput),
    h('div', { class: 'field' }, h('label', {}, 'Follow-up date'), followInput),
    !closed ? h('button', {
      class: 'btn btn-primary',
      onclick: async () => { try { await saveAll(); toast('Encounter saved'); reload(); } catch (err) { toast(err.message, 'error'); } }
    }, 'Save Encounter') : null));

  root.appendChild(h('div', { class: 'grid-2' },
    h('div', null, vitalsCard, h('div', { style: { height: '16px' } }), card('Prescriptions', rxHolder)),
    notesCard));
  root.appendChild(h('div', { style: { height: '16px' } }));
  root.appendChild(card('Laboratory Orders', labHolder, { flush: false }));
  await drawLabs();
}