const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.2c2.8.3 5 2.4 5 5.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  pill: '<rect x="3.5" y="9" width="17" height="6.5" rx="3.25" transform="rotate(-40 12 12)"/><path d="M9.5 8.5l5.5 6.5"/>',
  bed: '<path d="M3 7v11M3 14h18v4M3 11h18v3M7 11V9h5v2"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z"/><path d="M9.5 8h5M9.5 12h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  cross: '<path d="M12 5v14M5 12h14"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'
};

export function icon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] || ICONS.grid;
  return svg;
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  if (attrs && attrs.value !== undefined && attrs.value !== null) el.value = attrs.value;
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export const fmtMoney = n => '$' + (Number(n) || 0).toFixed(2);
export const fmtDate = d => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = d => d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const todayStr = (d = new Date()) => { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const age = dob => { const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; };
export const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

const STATUS_STYLE = {
  scheduled: 'b-blue', 'checked-in': 'b-teal', 'in-consultation': 'b-amber', completed: 'b-green',
  cancelled: 'b-gray', 'no-show': 'b-red', open: 'b-amber', closed: 'b-green',
  ordered: 'b-blue', 'sample-collected': 'b-teal', processing: 'b-amber',
  available: 'b-green', occupied: 'b-red', cleaning: 'b-amber', maintenance: 'b-gray',
  admitted: 'b-blue', discharged: 'b-gray', unpaid: 'b-red', partial: 'b-amber', paid: 'b-green',
  active: 'b-green', inactive: 'b-gray', 'walk-in': 'b-teal'
};
export const badge = (status, label) => h('span', { class: 'badge ' + (STATUS_STYLE[status] || 'b-gray') }, label || String(status).replace(/-/g, ' '));

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const t = h('div', { class: `toast ${type}` }, icon(type === 'error' ? 'x' : type === 'info' ? 'bell' : 'check'), message);
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3800);
}

export function modal(title, content, opts = {}) {
  const root = document.getElementById('modal-root');
  const previousFocus = document.activeElement;
  const titleId = 'modal-' + crypto.randomUUID();
  const overlay = h('div', { class: 'modal-overlay' });
  const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    if (opts.onClose) opts.onClose();
  };
  const onKey = e => {
    if (root.lastElementChild !== overlay) return;
    if (e.key === 'Escape' && !opts.locked) { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const controls = [...box.querySelectorAll('button,input,select,textarea,a[href]')].filter(el => !el.disabled && el.offsetParent !== null);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay && !opts.locked) close(); });
  overlay.addEventListener('medcore:close', close);
  box.appendChild(h('div', { class: 'modal-head' },
    h('div', { class: 'modal-title', id: titleId }, title),
    h('button', { type: 'button', class: 'modal-close', onclick: close, 'aria-label': 'Close' }, icon('x'))));
  const body = h('div', { class: 'modal-body' }, content);
  box.appendChild(body);
  if (opts.footer) box.appendChild(h('div', { class: 'modal-foot' }, opts.footer));
  overlay.appendChild(box);
  root.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  box.querySelector('button').focus();
  return { close, body, box, overlay };
}

export function confirmModal(message, title = 'Please confirm') {
  return new Promise(resolve => {
    const m = modal(title, h('p', { style: { fontSize: '13.5px', lineHeight: '1.6' } }, message), {
      onClose: () => resolve(false),
      footer: [
        h('button', { class: 'btn btn-outline', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn btn-danger', onclick: () => { resolve(true); m.close(); } }, 'Confirm')
      ]
    });
  });
}

export function formModal(title, fields, onSubmit, opts = {}) {
  const form = h('form', { id: 'fm-' + Math.random().toString(36).slice(2, 9) });
  const inputs = {};
  const grid = opts.twoCol ? h('div', { class: 'form-grid' }) : null;
  for (const f of fields) {
    let input;
    const inputId = form.id + '-' + f.name;
    const common = { id: inputId, name: f.name, value: f.value ?? '', required: f.required !== false && f.type !== 'checkbox' };
    if (f.type === 'select') {
      input = h('select', { ...common, disabled: f.disabled },
        (f.placeholder !== false ? [h('option', { value: '' }, f.placeholder || 'Select…')] : []).concat(
          (f.options || []).map(o => typeof o === 'object'
            ? h('option', { value: o.value, selected: String(o.value) === String(f.value ?? '') }, o.label)
            : h('option', { value: o, selected: String(o) === String(f.value ?? '') }, o))));
    } else if (f.type === 'textarea') {
      input = h('textarea', { ...common, placeholder: f.placeholder || '', rows: f.rows || 3 }, f.value ?? '');
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', id: inputId, name: f.name, checked: !!f.value });
      const wrap = h('div', { class: 'checkbox-field' + (f.full ? ' full' : '') }, input, h('label', { for: inputId }, f.label));
      (grid || form).appendChild(wrap);
      inputs[f.name] = input;
      continue;
    } else {
      input = h('input', { ...common, type: f.type || 'text', placeholder: f.placeholder || '', min: f.min, max: f.max, step: f.step, disabled: f.disabled });
    }
    const wrap = h('div', { class: 'field' + (f.full || !grid ? ' full' : '') },
      h('label', { for: inputId }, f.label + (f.required === false ? ' (optional)' : '')), input,
      f.hint ? h('div', { class: 'hint' }, f.hint) : null);
    (grid || form).appendChild(wrap);
    inputs[f.name] = input;
  }
  if (grid) form.appendChild(grid);

  let m;
  const submitBtn = h('button', { type: 'submit', form: form.id, class: 'btn btn-primary' }, opts.submitLabel || 'Save');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const input = inputs[f.name];
      if (f.type === 'checkbox') values[f.name] = input.checked;
      else if (f.type === 'number') values[f.name] = input.value === '' ? null : Number(input.value);
      else values[f.name] = f.type === 'password' ? input.value : input.value.trim();
    }
    submitBtn.disabled = true;
    try {
      await onSubmit(values);
      m.close();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
  m = modal(title, form, {
    wide: opts.wide,
    footer: [
      h('button', { class: 'btn btn-outline', onclick: () => m.close() }, 'Cancel'),
      submitBtn
    ]
  });
  const first = form.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return m;
}

export function table(cols, rows, opts = {}) {
  const thead = h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.label))));
  const tbody = h('tbody');
  if (!rows.length) {
    tbody.appendChild(h('tr', null, h('td', { colspan: cols.length }, h('div', { class: 'empty' }, opts.emptyText || 'No records found'))));
  }
  for (const row of rows) {
    const tr = h('tr', { class: opts.onRowClick ? 'clickable' : '' },
      cols.map(c => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(row) : (row[c.key] ?? '—'))));
    if (opts.onRowClick) tr.addEventListener('click', () => opts.onRowClick(row));
    tbody.appendChild(tr);
  }
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, thead, tbody));
}

export function card(title, body, opts = {}) {
  return h('div', { class: 'card', style: opts.style },
    title ? h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, title), opts.actions || null) : null,
    h('div', { class: 'card-body' + (opts.flush ? ' flush' : '') }, body));
}

export function statCard(label, value, iconName, color) {
  return h('div', { class: 'stat-card' },
    h('div', { class: `stat-icon si-${color || 'teal'}` }, icon(iconName || 'grid')),
    h('div', null, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label)));
}

export function loading() {
  return h('div', { class: 'loading' }, h('div', { class: 'spinner' }, ''), 'Loading…');
}

export function searchBox(placeholder, onInput) {
  const input = h('input', { type: 'search', placeholder });
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onInput(input.value), 250); });
  return h('div', { class: 'search-box' }, icon('search'), input);
}

export function tabs(items, onChange) {
  let active = items[0].id;
  const bar = h('div', { class: 'tabs' });
  const render = () => {
    clear(bar);
    for (const it of items) {
      bar.appendChild(h('button', {
        class: 'tab' + (it.id === active ? ' active' : ''),
        onclick: () => { active = it.id; render(); onChange(it.id); }
      }, it.label));
    }
  };
  render();
  return bar;
}

export const patientLabel = p => `${p.firstName} ${p.lastName} (${p.mrn})`;
export const roleLabel = r => ({ admin: 'Administrator', doctor: 'Doctor', nurse: 'Nurse', receptionist: 'Receptionist', pharmacist: 'Pharmacist', labtech: 'Lab Technician', accountant: 'Accountant' }[r] || r);