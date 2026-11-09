import { GET, POST, PUT } from '../api.js';
import { h, clear, card, badge, formModal, toast, icon, statCard } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  let lastSig = null;

  async function load() {
    let queue;
    try { queue = await GET('/api/queue'); }
    catch (err) { if (root.isConnected) toast(err.message, 'error'); return; }
    if (!root.isConnected) return;
    const sig = JSON.stringify(queue);
    if (sig === lastSig && holder.childNodes.length) return;
    lastSig = sig;
    clear(holder);
    if (!queue.length) {
      holder.appendChild(card(null, h('div', { class: 'empty' }, 'The queue is empty — no patients waiting right now.')));
      return;
    }
    holder.appendChild(h('div', { class: 'stats-grid' },
      statCard('Waiting', queue.filter(q => q.status === 'checked-in').length, 'clock', 'amber'),
      statCard('In consultation', queue.filter(q => q.status === 'in-consultation').length, 'clipboard', 'teal'),
      statCard('Walk-ins', queue.filter(q => q.status === 'walk-in').length, 'users', 'blue')));

    const list = h('div', { class: 'card' }, h('div', { class: 'card-body flush' },
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['#', 'Patient', 'Doctor', 'Time', 'Reason', 'Status', 'Actions'].map(x => h('th', null, x)))),
        h('tbody', null, queue.map((q, i) => h('tr', null,
          h('td', { class: 'td-main' }, i + 1),
          h('td', null, h('div', { class: 'td-main' }, q.patientName), h('div', { class: 'td-sub' }, q.patientMrn)),
          h('td', null, q.doctorName),
          h('td', null, q.time),
          h('td', null, q.reason || '—'),
          h('td', null, badge(q.status)),
          h('td', null, rowActions(q)))))))));
    holder.appendChild(list);
  }

  function rowActions(q) {
    const row = h('div', { class: 'btn-row' });
    const clinical = ['admin', 'doctor', 'nurse'].includes(ctx.user.role);
    if (!clinical) return h('span', { class: 'td-sub' }, 'Waiting for clinician');
    if (!q.encounterId) {
      row.appendChild(h('button', {
        class: 'btn btn-primary btn-sm',
        onclick: async () => {
          try {
            const enc = await POST('/api/encounters', {
              patientId: q.patientId, appointmentId: q.status === 'walk-in' ? undefined : q.id,
              doctorId: q.doctorId, complaints: q.reason
            });
            toast('Consultation opened');
            ctx.navigate('encounters/' + enc.id);
          } catch (err) { toast(err.message, 'error'); }
        }
      }, ctx.user.role === 'nurse' ? 'Record Vitals' : 'Open Consultation'));
    } else {
      row.appendChild(h('button', { class: 'btn btn-outline btn-sm', onclick: () => ctx.navigate('encounters/' + q.encounterId) },
        q.status === 'in-consultation' ? 'Continue' : 'Open Chart'));
    }
    return row;
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Patient Queue'), h('div', { class: 'page-sub' }, 'Live waiting list for today')),
    h('button', { class: 'btn btn-outline', onclick: load }, icon('activity'), 'Refresh')));
  root.appendChild(holder);
  await load();
  const timer = setInterval(load, 30000);
  const observer = new MutationObserver(() => { if (!root.isConnected) { clearInterval(timer); observer.disconnect(); } });
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
}