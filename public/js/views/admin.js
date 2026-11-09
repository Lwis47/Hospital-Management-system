import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, icon, fmtDate, fmtDateTime, tabs, roleLabel } from '../ui.js';

const ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'labtech', 'accountant'];

export async function render(root, ctx) {
  const holder = h('div');

  async function drawUsers() {
    const users = await GET('/api/users');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Name', render: u => h('div', null, h('div', { class: 'td-main' }, u.name), h('div', { class: 'td-sub' }, '@' + u.username)) },
      { label: 'Role', render: u => badge(u.role === 'admin' ? 'occupied' : 'scheduled', roleLabel(u.role)) },
      { label: 'Department', render: u => u.department || '—' },
      { label: 'Phone', render: u => u.phone || '—' },
      { label: 'Status', render: u => badge(u.active ? 'active' : 'inactive') },
      { label: '', render: u => h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editUser(u, drawUsers) }, icon('edit')) }
    ], users), { flush: true }));
    holder.appendChild(h('div', { style: { marginTop: '14px' } },
      h('button', { class: 'btn btn-primary', onclick: () => editUser(null, drawUsers) }, icon('plus'), 'Add Staff Account')));
  }

  async function drawDepartments() {
    const deps = await GET('/api/departments');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Department', render: d => h('span', { class: 'td-main' }, d.name) },
      { label: 'Doctors', render: d => h('span', { class: 'td-sub' }, 'see staff list') }
    ], deps), { flush: true }));
    holder.appendChild(h('div', { style: { marginTop: '14px' } },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => formModal('Add Department', [{ name: 'name', label: 'Department name', full: true }], async v => {
          await POST('/api/departments', v);
          toast('Department added');
          drawDepartments();
        }, { submitLabel: 'Add Department' })
      }, icon('plus'), 'Add Department')));
  }

  async function drawAudit() {
    const audit = await GET('/api/audit?limit=300');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'When', render: a => fmtDateTime(a.date) },
      { label: 'User', key: 'userName' },
      { label: 'Action', render: a => badge(a.action === 'login' ? 'scheduled' : a.action === 'payment' ? 'paid' : 'open', a.action) },
      { label: 'Entity', key: 'entity' },
      { label: 'Detail', render: a => a.detail || '—' }
    ], audit), { flush: true }));
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Administration'), h('div', { class: 'page-sub' }, 'Staff accounts, departments and audit trail'))));
  root.appendChild(tabs([
    { id: 'users', label: 'Staff & Users' },
    { id: 'deps', label: 'Departments' },
    { id: 'audit', label: 'Audit Log' }
  ], id => id === 'users' ? drawUsers() : id === 'deps' ? drawDepartments() : drawAudit()));
  root.appendChild(holder);
  await drawUsers();
}

function editUser(u, onDone) {
  const fields = [
    { name: 'name', label: 'Full name', value: u?.name || '' },
    { name: 'username', label: 'Username', value: u?.username || '', disabled: !!u },
    { name: 'role', label: 'Role', type: 'select', options: ROLES.map(r => ({ value: r, label: roleLabel(r) })), value: u?.role || 'nurse', placeholder: false },
    { name: 'phone', label: 'Phone', value: u?.phone || '', required: false },
    { name: 'password', label: u ? 'New password (leave blank to keep)' : 'Password', type: 'password', required: !u, full: true },
    { name: 'department', label: 'Department (doctors)', value: u?.department || '', required: false },
    { name: 'specialization', label: 'Specialization (doctors)', value: u?.specialization || '', required: false },
    { name: 'consultationFee', label: 'Consultation fee ($) — doctors', type: 'number', min: '0', value: u?.consultationFee ?? 30, required: false }
  ];
  if (u) fields.push({ name: 'active', label: 'Account active', type: 'checkbox', value: u.active, full: true });
  formModal(u ? `Edit ${u.name}` : 'Add Staff Account', fields, async v => {
    if (u) {
      const payload = { ...v };
      if (!payload.password) delete payload.password;
      delete payload.username;
      await PUT('/api/users/' + u.id, payload);
    } else {
      await POST('/api/users', v);
    }
    toast(u ? 'User updated' : 'Staff account created');
    onDone();
  }, { twoCol: true, wide: true });
}