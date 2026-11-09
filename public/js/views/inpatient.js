import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, confirmModal, modal, icon, fmtDate, tabs, patientLabel } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  const canAdmit = ['admin', 'doctor'].includes(ctx.user.role);
  const canManageBeds = ['admin', 'nurse'].includes(ctx.user.role);

  async function drawBeds() {
    const [wards, beds, admissions] = await Promise.all([GET('/api/wards'), GET('/api/beds'), GET('/api/admissions?status=admitted')]);
    clear(holder);
    for (const w of wards) {
      const wardBeds = beds.filter(b => b.wardId === w.id);
      holder.appendChild(h('div', { class: 'ward-block' },
        h('div', { class: 'ward-head' },
          h('span', { class: 'ward-name' }, w.name),
          badge(w.type === 'Intensive Care' ? 'occupied' : 'scheduled', w.type),
          h('span', { class: 'td-sub' }, `${w.occupied}/${w.bedCount} occupied · $${w.dailyRate}/day`),
          canManageBeds ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => addBed(w, drawBeds) }, icon('plus'), 'Bed') : null),
        h('div', { class: 'bed-grid' }, wardBeds.map(b => h('div', {
          class: 'bed ' + b.status,
          onclick: () => bedClick(b, admissions, wards, drawBeds)
        },
          h('div', { class: 'bed-label' }, b.label, h('span', { class: 'bed-dot' })),
          h('div', { class: 'bed-patient' }, b.patientName || (b.status === 'available' ? 'Available' : b.status)))))));
    }
    if (ctx.user.role === 'admin') {
      holder.appendChild(h('button', { class: 'btn btn-outline', onclick: () => addWard(drawBeds) }, icon('plus'), 'Add Ward'));
    }
    holder.appendChild(h('div', { class: 'legend', style: { marginTop: '8px' } },
      h('span', null, h('i', { style: { background: 'var(--ok)' } }), 'Available'),
      h('span', null, h('i', { style: { background: 'var(--danger)' } }), 'Occupied'),
      h('span', null, h('i', { style: { background: 'var(--warn)' } }), 'Cleaning'),
      h('span', null, h('i', { style: { background: 'var(--muted)' } }), 'Maintenance')));
  }

  function bedClick(b, admissions, wards, reload) {
    if (b.status === 'occupied') {
      const adm = admissions.find(a => a.bedId === b.id);
      if (adm) admissionModal(adm, b, reload);
      return;
    }
    if (b.status === 'available' && canAdmit) return admitForm(b, reload);
    if (['cleaning', 'maintenance'].includes(b.status) && canManageBeds) {
      confirmModal(`Mark bed ${b.label} as available?`).then(async ok => {
        if (!ok) return;
        try { await PUT('/api/beds/' + b.id, { status: 'available' }); toast('Bed available'); reload(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }
  }

  function admissionModal(adm, bed, reload) {
    const canDischarge = ['admin', 'doctor', 'nurse'].includes(ctx.user.role);
    const body = h('div', null,
      h('dl', { class: 'kv' },
        h('dt', {}, 'Patient'), h('dd', {}, `${adm.patientName} (${adm.patientMrn})`),
        h('dt', {}, 'Doctor'), h('dd', {}, adm.doctorName),
        h('dt', {}, 'Admitted'), h('dd', {}, fmtDate(adm.admitDate)),
        h('dt', {}, 'Diagnosis'), h('dd', {}, adm.diagnosis || '—'),
        h('dt', {}, 'Notes'), h('dd', {}, adm.notes || '—')));
    const footer = [];
    if (canDischarge) {
      footer.push(h('button', {
        class: 'btn btn-outline',
        onclick: async () => {
          const beds = await GET('/api/beds?status=available');
          m.close();
          formModal(`Transfer ${adm.patientName}`, [
            { name: 'bedId', label: 'New bed', type: 'select', options: beds.filter(x => x.id !== bed.id).map(x => ({ value: x.id, label: `${x.label} — ${x.wardName}` })), full: true, hint: 'Current bed stay will be billed and the bed sent for cleaning.' }
          ], async v => {
            await PUT('/api/admissions/' + adm.id, { action: 'transfer', bedId: v.bedId });
            toast('Patient transferred');
            reload();
          }, { submitLabel: 'Transfer' });
        }
      }, 'Transfer'));
      footer.push(h('button', {
        class: 'btn btn-danger',
        onclick: async () => {
          m.close();
          if (!(await confirmModal(`Discharge ${adm.patientName}? Bed charges will be billed and bed ${bed.label} sent for cleaning.`))) return;
          try { await PUT('/api/admissions/' + adm.id, { action: 'discharge' }); toast('Patient discharged'); reload(); }
          catch (err) { toast(err.message, 'error'); }
        }
      }, 'Discharge'));
    }
    const m = modal(`Admission — ${bed.label}`, body, { footer });
  }

  async function admitForm(b, reload) {
    const [patients, doctors] = await Promise.all([GET('/api/patients'), GET('/api/doctors')]);
    formModal(`Admit Patient — bed ${b.label}`, [
      { name: 'patientId', label: 'Patient', type: 'select', options: patients.map(p => ({ value: p.id, label: patientLabel(p) })), full: true },
      { name: 'doctorId', label: 'Attending doctor', type: 'select', options: doctors.map(d => ({ value: d.id, label: d.name })), full: true },
      { name: 'diagnosis', label: 'Admission diagnosis', type: 'textarea', full: true },
      { name: 'notes', label: 'Notes', type: 'textarea', required: false, full: true }
    ], async v => {
      await POST('/api/admissions', { ...v, bedId: b.id });
      toast('Patient admitted');
      reload();
    }, { wide: true, submitLabel: 'Admit Patient' });
  }

  async function drawAdmissions() {
    const list = await GET('/api/admissions');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Patient', render: a => h('div', null, h('div', { class: 'td-main' }, a.patientName), h('div', { class: 'td-sub' }, a.patientMrn)) },
      { label: 'Bed', render: a => `${a.bedLabel} · ${a.wardName}` },
      { label: 'Doctor', key: 'doctorName' },
      { label: 'Admitted', render: a => fmtDate(a.admitDate) },
      { label: 'Discharged', render: a => a.dischargeDate ? fmtDate(a.dischargeDate) : '—' },
      { label: 'Diagnosis', key: 'diagnosis' },
      { label: 'Status', render: a => badge(a.status) }
    ], list, { emptyText: 'No admissions recorded' }), { flush: true }));
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Wards & Admissions'), h('div', { class: 'page-sub' }, canAdmit ? 'Click an available bed to admit a patient' : 'Live bed status across all wards'))));
  root.appendChild(tabs([{ id: 'beds', label: 'Bed Map' }, { id: 'adm', label: 'Admission Register' }],
    id => id === 'beds' ? drawBeds() : drawAdmissions()));
  root.appendChild(holder);
  await drawBeds();
}

function addBed(w, onDone) {
  formModal(`Add Bed — ${w.name}`, [
    { name: 'label', label: 'Bed label', placeholder: 'e.g. GenM-07', full: true }
  ], async v => {
    await POST('/api/beds', { wardId: w.id, label: v.label });
    toast('Bed added');
    onDone();
  }, { submitLabel: 'Add Bed' });
}

function addWard(onDone) {
  formModal('Add Ward', [
    { name: 'name', label: 'Ward name', full: true },
    { name: 'type', label: 'Type', type: 'select', options: ['General', 'Private', 'Intensive Care', 'Maternity', 'Pediatric', 'Isolation'], value: 'General', placeholder: false },
    { name: 'dailyRate', label: 'Daily rate ($)', type: 'number', min: '0', value: 20 }
  ], async v => {
    await POST('/api/wards', v);
    toast('Ward created — add beds to it');
    onDone();
  }, { twoCol: true, submitLabel: 'Create Ward' });
}