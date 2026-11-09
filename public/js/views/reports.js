import { GET } from '../api.js';
import { h, clear, card, table, statCard, fmtMoney, todayStr, toast } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  const toInput = h('input', { type: 'date', value: todayStr() });
  const fromD = new Date(); fromD.setDate(fromD.getDate() - 30);
  const fromInput = h('input', { type: 'date', value: fromD.toISOString().slice(0, 10) });
  const run = h('button', { class: 'btn btn-primary btn-sm' }, 'Run Report');
  run.addEventListener('click', load);

  async function load() {
    clear(holder);
    holder.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), 'Crunching numbers…'));
    const r = await GET(`/api/reports?from=${fromInput.value}&to=${toInput.value}`);
    clear(holder);
    holder.appendChild(h('div', { class: 'stats-grid' },
      statCard('Revenue Collected', fmtMoney(r.revenue), 'money', 'green'),
      statCard('Total Billed', fmtMoney(r.billedTotal), 'receipt', 'blue'),
      statCard('Outstanding (all time)', fmtMoney(r.outstanding), 'receipt', 'red'),
      statCard('Invoices Issued', r.invoicesIssued, 'receipt', 'teal'),
      statCard('Encounters', r.encounters, 'clipboard', 'teal'),
      statCard('Appointments', r.appointments, 'calendar', 'blue'),
      statCard('Lab Orders', r.labOrders, 'flask', 'amber'),
      statCard('Admissions', r.admissions, 'bed', 'blue')));

    const methods = Object.entries(r.paymentsByMethod);
    const maxM = Math.max(...methods.map(([, v]) => v), 1);
    holder.appendChild(h('div', { class: 'grid-2' },
      card('Collections by payment method', methods.length ? h('div', null, methods.map(([m, v]) =>
        h('div', { style: { marginBottom: '12px' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' } },
            h('span', null, m), h('b', null, fmtMoney(v))),
          h('div', { style: { height: '9px', background: 'var(--bg)', borderRadius: '5px' } },
            h('div', { style: { width: `${(v / maxM) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '5px' } })))))
        : h('div', { class: 'empty' }, 'No payments in this period')),
      card('Top dispensed drugs (by revenue)', table([
        { label: 'Drug', key: 'name' },
        { label: 'Qty', num: true, key: 'qty' },
        { label: 'Revenue', num: true, render: d => fmtMoney(d.revenue) }
      ], r.topDrugs, { emptyText: 'No dispensing in this period' }), { flush: true })));
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Reports & Analytics'), h('div', { class: 'page-sub' }, 'Financial and operational summaries'))));
  root.appendChild(h('div', { class: 'toolbar' },
    h('label', { class: 'td-sub' }, 'From'), fromInput,
    h('label', { class: 'td-sub' }, 'To'), toInput, run));
  root.appendChild(holder);
  await load();
}