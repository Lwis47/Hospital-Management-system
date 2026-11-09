import { GET, POST, setToken, clearToken, getToken } from './api.js';
import { h, clear, icon, toast, modal, initials, roleLabel, fmtMoney, badge } from './ui.js';

const app = document.getElementById('app');
let currentUser = null;
let contentEl = null;
let titleEl = null;
let bellCountEl = null;
let routeVersion = 0;

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid', section: 'Overview', roles: '*' },
  { id: 'patients', label: 'Patients', icon: 'users', section: 'Front Desk', roles: '*' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar', roles: ['admin', 'receptionist', 'doctor', 'nurse'] },
  { id: 'queue', label: 'Patient Queue', icon: 'list', roles: ['admin', 'receptionist', 'doctor', 'nurse'] },
  { id: 'encounters', label: 'Consultations / EMR', icon: 'clipboard', section: 'Clinical', roles: ['admin', 'doctor', 'nurse'] },
  { id: 'lab', label: 'Laboratory', icon: 'flask', roles: ['admin', 'labtech', 'doctor', 'nurse'] },
  { id: 'pharmacy', label: 'Pharmacy', icon: 'pill', roles: ['admin', 'pharmacist', 'doctor'] },
  { id: 'inpatient', label: 'Wards & Admissions', icon: 'bed', roles: ['admin', 'doctor', 'nurse', 'receptionist', 'accountant'] },
  { id: 'billing', label: 'Billing & Payments', icon: 'receipt', section: 'Business', roles: ['admin', 'accountant', 'receptionist'] },
  { id: 'reports', label: 'Reports', icon: 'chart', roles: ['admin', 'accountant'] },
  { id: 'admin', label: 'Administration', icon: 'sliders', section: 'System', roles: ['admin'] }
];

const VIEW_LOADERS = {
  dashboard: () => import('./views/dashboard.js'),
  patients: () => import('./views/patients.js'),
  appointments: () => import('./views/appointments.js'),
  queue: () => import('./views/queue.js'),
  encounters: () => import('./views/encounters.js'),
  lab: () => import('./views/lab.js'),
  pharmacy: () => import('./views/pharmacy.js'),
  inpatient: () => import('./views/inpatient.js'),
  billing: () => import('./views/billing.js'),
  reports: () => import('./views/reports.js'),
  admin: () => import('./views/admin.js')
};

const DEMO_ACCOUNTS = [
  ['admin', 'Admin@123', 'Administrator'],
  ['dr.adams', 'Doctor@123', 'Doctor'],
  ['reception', 'Recept@123', 'Receptionist'],
  ['nurse', 'Nurse@123', 'Nurse'],
  ['pharma', 'Pharma@123', 'Pharmacist'],
  ['lab', 'Lab@123', 'Lab Technician'],
  ['accounts', 'Accounts@123', 'Accountant']
];

function renderLogin() {
  currentUser = null;
  routeVersion++;
  contentEl = null;
  bellCountEl = null;
  document.querySelectorAll('.modal-overlay').forEach(el => el.dispatchEvent(new Event('medcore:close')));
  clear(app);
  const error = h('div', { class: 'login-error', role: 'alert', style: { display: 'none' } });
  const username = h('input', { id: 'username', type: 'text', required: true, placeholder: 'e.g. admin', autocomplete: 'username' });
  const password = h('input', { id: 'password', type: 'password', required: true, placeholder: 'Password', autocomplete: 'current-password' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', style: { width: '100%', justifyContent: 'center', padding: '11px' } }, 'Sign in');
  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault();
      submit.disabled = true;
      error.style.display = 'none';
      try {
        const res = await POST('/api/login', { username: username.value.trim(), password: password.value });
        setToken(res.token);
        currentUser = res.user;
        renderShell();
      } catch (err) {
        error.textContent = err.message;
        error.style.display = 'block';
      } finally { submit.disabled = false; }
    }
  },
    h('div', { class: 'field' }, h('label', { for: 'username' }, 'Username'), username),
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), password),
    submit);

  const demo = h('details', { class: 'demo-accounts' },
    h('summary', {}, 'Demo accounts (click to fill)'),
    h('div', { class: 'demo-grid' }, DEMO_ACCOUNTS.map(([u, p, label]) =>
      h('button', {
        type: 'button', class: 'demo-btn',
        onclick: () => { username.value = u; password.value = p; }
      }, h('b', {}, label), h('span', {}, `${u} / ${p}`)))));

  app.appendChild(h('div', { class: 'login-wrap' },
    h('div', { class: 'login-card' },
      h('div', { class: 'login-brand' },
        h('div', { class: 'brand-logo' }, icon('cross')),
        h('div', null, h('div', { class: 'login-title' }, 'MedCore HMS'), h('div', { class: 'brand-sub', style: { color: 'var(--muted)' } }, 'Hospital Management System'))),
      h('p', { class: 'login-sub' }, 'Sign in to access the hospital workspace'),
      error, form, demo,
      h('p', { class: 'demo-notice' }, 'Local demonstration only. Use fictional patient data.'))));
  username.focus();
}

function visibleNav() {
  return NAV.filter(n => n.roles === '*' || n.roles.includes(currentUser.role));
}

function renderShell() {
  clear(app);
  const nav = h('nav', { class: 'nav' });
  let lastSection = null;
  for (const item of visibleNav()) {
    if (item.section && item.section !== lastSection) {
      nav.appendChild(h('div', { class: 'nav-section' }, item.section));
      lastSection = item.section;
    }
    nav.appendChild(h('button', {
      class: 'nav-item', dataset: { view: item.id }, title: item.label, 'aria-label': item.label, onclick: () => navigate(item.id)
    }, icon(item.icon), h('span', {}, item.label)));
  }

  titleEl = h('div', { class: 'topbar-title' }, 'Dashboard');
  bellCountEl = h('span', { class: 'alert-count', style: { display: 'none' } }, '0');
  contentEl = h('main', { class: 'content' });

  const layout = h('div', { class: 'layout' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' },
        h('div', { class: 'brand-logo' }, icon('cross')),
        h('div', null, h('div', { class: 'brand-name' }, 'MedCore'), h('div', { class: 'brand-sub' }, 'Hospital System'))),
      nav,
      h('div', { class: 'sidebar-footer' }, 'MedCore HMS v1.0')),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        titleEl,
        h('div', { class: 'topbar-right' },
          h('button', { class: 'alert-bell', onclick: showAlerts, title: 'Alerts' }, icon('bell'), bellCountEl),
          h('div', { class: 'user-chip' },
            h('div', { class: 'avatar' }, initials(currentUser.name)),
            h('div', null, h('div', { class: 'user-name' }, currentUser.name), h('div', { class: 'user-role' }, roleLabel(currentUser.role)))),
          h('button', {
            class: 'btn btn-ghost btn-sm', title: 'Sign out',
            onclick: async () => { try { await POST('/api/logout', {}); } catch {} clearToken(); renderLogin(); }
          }, icon('logout'), 'Sign out'))),
      contentEl));
  app.appendChild(layout);
  route();
  refreshAlertCount();
}

export function navigate(path) {
  const hash = '#/' + path;
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  if (!currentUser || !contentEl) return;
  const version = ++routeVersion;
  const target = contentEl;
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const viewId = parts[0];
  let params;
  try { params = parts.slice(1).map(decodeURIComponent); }
  catch { navigate('dashboard'); return; }
  const navItem = visibleNav().find(n => n.id === viewId);
  if (!navItem) { navigate('dashboard'); return; }
  document.querySelectorAll('.modal-overlay').forEach(el => el.dispatchEvent(new Event('medcore:close')));
  titleEl.textContent = navItem.label;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === viewId));
  clear(target);
  target.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), 'Loading…'));
  try {
    const mod = await VIEW_LOADERS[viewId]();
    if (version !== routeVersion || !currentUser) return;
    clear(target);
    const viewRoot = h('div');
    target.appendChild(viewRoot);
    await mod.render(viewRoot, { user: currentUser, params, navigate });
  } catch (err) {
    if (version !== routeVersion || !currentUser) return;
    clear(target);
    target.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-body' },
      h('p', { role: 'alert', style: { color: 'var(--danger)' } }, 'Failed to load view: ' + err.message))));
  }
  if (version === routeVersion) refreshAlertCount();
}

window.addEventListener('hashchange', route);

async function refreshAlertCount() {
  if (!bellCountEl) return;
  try {
    const a = await GET('/api/alerts');
    if (!bellCountEl || !currentUser) return;
    const count = a.lowStock.length + a.expiringSoon.length + a.unpaidInvoices.length + (a.pendingLabs ? 1 : 0);
    bellCountEl.textContent = count;
    bellCountEl.style.display = count ? 'block' : 'none';
  } catch { /* ignore */ }
}

async function showAlerts() {
  const a = await GET('/api/alerts').catch(err => { toast(err.message, 'error'); return null; });
  if (!a) return;
  const items = [];
  for (const d of a.lowStock) items.push(['var(--warn)', `Low stock: ${d.name}`, `Only ${d.stock} ${d.unit}(s) left (reorder level ${d.reorderLevel})`]);
  for (const d of a.expiringSoon) items.push([d.expired ? 'var(--danger)' : 'var(--warn)', `${d.expired ? 'Expired' : 'Expiring soon'}: ${d.name}`, `Batch ${d.batchNo} — expiry ${d.expiryDate}`]);
  if (a.pendingLabs) items.push(['var(--info)', `${a.pendingLabs} lab order(s) pending`, 'Awaiting sample collection, processing or results']);
  for (const i of a.unpaidInvoices) items.push(['var(--danger)', `Unpaid balance: ${i.patientName}`, `Invoice ${i.number} — ${fmtMoney(i.balance)} outstanding`]);
  const body = items.length
    ? h('div', { class: 'alert-list' }, items.map(([color, title, meta]) =>
      h('div', { class: 'alert-item' }, h('span', { class: 'alert-dot', style: { background: color } }),
        h('div', null, h('div', { class: 'alert-text' }, h('b', {}, title)), h('div', { class: 'alert-meta' }, meta)))))
    : h('div', { class: 'empty' }, 'No alerts — everything looks good.');
  modal('Hospital Alerts', body);
}

window.addEventListener('hms:unauthorized', () => { if (currentUser) renderLogin(); });

(async function boot() {
  if (getToken()) {
    try {
      currentUser = await GET('/api/me');
      renderShell();
      return;
    } catch { clearToken(); }
  }
  renderLogin();
})();