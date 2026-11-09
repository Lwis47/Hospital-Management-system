import { GET } from '../api.js';
import { h, card, statCard, fmtMoney, fmtDateTime, icon, badge } from '../ui.js';

export async function render(root, ctx) {
  const data = await GET('/api/dashboard');
  const s = data.stats;

  const stats = h('div', { class: 'stats-grid' },
    statCard('Registered Patients', s.patients, 'users', 'teal'),
    statCard("Today's Appointments", s.appointmentsToday, 'calendar', 'blue'),
    statCard('In Queue Now', s.queue, 'list', 'amber'),
    statCard('Open Consultations', s.openEncounters, 'clipboard', 'teal'),
    statCard('Admitted Patients', s.admitted, 'bed', 'blue'),
    statCard('Beds Available', `${s.bedsAvailable}/${s.bedsTotal}`, 'bed', 'green'),
    statCard('Pending Lab Orders', s.pendingLabs, 'flask', 'amber'),
    statCard('Low-stock Drugs', s.lowStock, 'pill', 'red'),
    s.revenueToday !== null ? statCard("Today's Revenue", fmtMoney(s.revenueToday), 'money', 'green') : null,
    s.unpaidTotal !== null ? statCard('Outstanding Bills', fmtMoney(s.unpaidTotal), 'receipt', 'red') : null);

  const maxRev = Math.max(...data.trend.map(d => d.revenue), 1);
  const maxAppt = Math.max(...data.trend.map(d => d.appointments), 1);
  const chart = h('div', null,
    h('div', { class: 'chart' }, data.trend.map(d =>
      h('div', { class: 'chart-col', title: `${d.date}: ${d.appointments} appointments, ${fmtMoney(d.revenue)} revenue` },
        h('div', { class: 'chart-val' }, d.appointments || ''),
        h('div', { class: 'chart-bar', style: { height: `${Math.max(3, (d.appointments / maxAppt) * 55)}%` } }),
        h('div', { class: 'chart-bar rev', style: { height: `${Math.max(3, (d.revenue / maxRev) * 35)}%` } }),
        h('div', { class: 'chart-lbl' }, new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }))))),
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'Appointments'),
      h('span', null, h('i', { style: { background: 'var(--info)' } }), 'Revenue (scaled)')));

  const activity = h('div', null, data.recentActivity.map(a =>
    h('div', { class: 'activity-item' },
      h('span', null, h('b', {}, a.userName), ` ${a.action} ${a.entity}${a.detail ? ' — ' + a.detail : ''}`),
      h('span', { class: 'activity-time' }, fmtDateTime(a.date)))));

  const quick = [];
  const role = ctx.user.role;
  if (['admin', 'receptionist'].includes(role)) quick.push(['Register patient', 'users', 'patients']);
  if (['admin', 'receptionist', 'doctor'].includes(role)) quick.push(['Book appointment', 'calendar', 'appointments']);
  if (['admin', 'doctor', 'nurse', 'receptionist'].includes(role)) quick.push(['View queue', 'list', 'queue']);
  if (['admin', 'doctor', 'nurse'].includes(role)) quick.push(['Consultations', 'clipboard', 'encounters']);
  if (['admin', 'pharmacist'].includes(role)) quick.push(['Pharmacy', 'pill', 'pharmacy']);
  if (['admin', 'labtech'].includes(role)) quick.push(['Laboratory', 'flask', 'lab']);
  if (['admin', 'accountant', 'receptionist'].includes(role)) quick.push(['Billing', 'receipt', 'billing']);

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null,
      h('div', { class: 'page-title' }, `Welcome back, ${ctx.user.name.split(' ')[0]}`),
      h('div', { class: 'page-sub' }, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))));
  root.appendChild(stats);
  root.appendChild(h('div', { class: 'grid-3-1' },
    card('Activity — last 7 days', chart),
    card('Quick actions', h('div', { class: 'btn-row', style: { flexDirection: 'column', alignItems: 'stretch' } },
      quick.map(([label, ic, view]) => h('button', { class: 'btn btn-outline', style: { justifyContent: 'flex-start' }, onclick: () => ctx.navigate(view) }, icon(ic), label))))));
  root.appendChild(h('div', { style: { height: '16px' } }));
  root.appendChild(h('div', { class: 'grid-2' },
    card('Recent activity', activity, { flush: true }),
    card('Hospital at a glance', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      glanceRow('Bed occupancy', `${Math.round(((s.bedsTotal - s.bedsAvailable) / Math.max(s.bedsTotal, 1)) * 100)}%`, (s.bedsTotal - s.bedsAvailable) / Math.max(s.bedsTotal, 1), 'var(--info)'),
      glanceRow('Queue load', `${s.queue} waiting`, Math.min(s.queue / 10, 1), 'var(--warn)'),
      glanceRow('Pending labs', `${s.pendingLabs} orders`, Math.min(s.pendingLabs / 10, 1), 'var(--accent)')))));
}

function glanceRow(label, value, pct, color) {
  return h('div', null,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' } },
      h('span', { style: { color: 'var(--muted)', fontWeight: '600' } }, label), h('b', {}, value)),
    h('div', { style: { height: '8px', background: 'var(--bg)', borderRadius: '5px', overflow: 'hidden' } },
      h('div', { style: { width: `${Math.round(pct * 100)}%`, height: '100%', background: color, borderRadius: '5px' } })));
}