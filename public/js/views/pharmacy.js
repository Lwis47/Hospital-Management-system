import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, icon, fmtDate, fmtDateTime, fmtMoney, tabs, todayStr } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  const canManage = ['admin', 'pharmacist'].includes(ctx.user.role);

  async function drawInventory() {
    const drugs = await GET('/api/drugs');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Drug', render: d => h('div', null, h('div', { class: 'td-main' }, d.name), h('div', { class: 'td-sub' }, d.genericName)) },
      { label: 'Category', key: 'category' },
      { label: 'Stock', render: d => h('span', { class: d.stock <= d.reorderLevel ? 'badge b-red' : '' }, `${d.stock} ${d.unit}${d.stock <= d.reorderLevel ? ' — LOW' : ''}`) },
      { label: 'Reorder lvl', num: true, key: 'reorderLevel' },
      { label: 'Unit price', num: true, render: d => fmtMoney(d.price) },
      { label: 'Batch', key: 'batchNo' },
      { label: 'Expiry', render: d => d.expiryDate ? h('span', { class: d.expiryDate <= todayStr() ? 'badge b-red' : '' }, fmtDate(d.expiryDate)) : '—' },
      { label: 'Actions', render: d => canManage ? h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-outline btn-sm', onclick: () => restock(d, drawInventory) }, 'Restock'),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editDrug(d, drawInventory) }, icon('edit'))) : '' }
    ], drugs), { flush: true }));
    if (canManage) {
      holder.appendChild(h('div', { style: { marginTop: '14px' } },
        h('button', { class: 'btn btn-primary', onclick: () => addDrug(drawInventory) }, icon('plus'), 'Add Drug')));
    }
  }

  async function drawPrescriptions() {
    const rx = await GET('/api/prescriptions');
    clear(holder);
    if (!rx.length) { holder.appendChild(card(null, h('div', { class: 'empty' }, 'No pending prescriptions'))); return; }
    for (const enc of rx) {
      const rows = enc.prescriptions.map(item => {
        const pending = item.qty - item.dispensed;
        return h('tr', null,
          h('td', null, h('div', { class: 'td-main' }, item.drugName), h('div', { class: 'td-sub' }, [item.dose, item.frequency, item.duration].filter(Boolean).join(' · '))),
          h('td', null, `${item.dispensed}/${item.qty}`),
          h('td', null, pending > 0 ? badge('partial', `${pending} pending`) : badge('paid', 'fully dispensed')),
          h('td', null, canManage && pending > 0 ? h('button', {
            class: 'btn btn-primary btn-sm',
            onclick: () => dispense(enc, item, pending, drawPrescriptions)
          }, 'Dispense') : ''));
      });
      holder.appendChild(h('div', { style: { marginBottom: '16px' } }, card(
        h('span', null, `${enc.patientName} (${enc.patientMrn}) — ${fmtDate(enc.date)} — ${enc.doctorName}`,
          enc.allergies.length ? h('span', { class: 'badge b-red', style: { marginLeft: '10px' } }, 'Allergies: ' + enc.allergies.join(', ')) : null),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, ['Drug & instructions', 'Dispensed', 'Status', ''].map(x => h('th', null, x)))),
          h('tbody', null, rows))), { flush: true })));
    }
  }

  async function drawHistory() {
    const list = await GET('/api/dispenses');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Date', render: d => fmtDateTime(d.date) },
      { label: 'Patient', key: 'patientName' },
      { label: 'Drug', key: 'drugName' },
      { label: 'Qty', render: d => `${d.qty} ${d.unit}` },
      { label: 'Total', num: true, render: d => fmtMoney(d.total) },
      { label: 'Pharmacist', key: 'pharmacistName' }
    ], list, { emptyText: 'No dispensing history yet' }), { flush: true }));
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Pharmacy'), h('div', { class: 'page-sub' }, 'Inventory, prescriptions and dispensing'))));
  const items = [{ id: 'inv', label: 'Drug Inventory' }, { id: 'rx', label: 'Pending Prescriptions' }];
  if (canManage || ctx.user.role === 'accountant') items.push({ id: 'hist', label: 'Dispense History' });
  root.appendChild(tabs(items, id => id === 'inv' ? drawInventory() : id === 'rx' ? drawPrescriptions() : drawHistory()));
  root.appendChild(holder);
  await drawInventory();
}

function dispense(enc, item, pending, onDone) {
  formModal(`Dispense — ${item.drugName}`, [
    { name: 'qty', label: `Quantity (max ${pending} ${item.drugName.includes('Tablet') ? 'tablets' : 'units'})`, type: 'number', min: '1', max: String(pending), value: pending, hint: `${enc.patientName} (${enc.patientMrn}) — will be billed automatically` }
  ], async v => {
    await POST('/api/dispense', { patientId: enc.patientId, encounterId: enc.encounterId, drugId: item.drugId, qty: Number(v.qty), prescriptionIndex: item.index });
    toast('Dispensed and billed');
    onDone();
  }, { submitLabel: 'Dispense' });
}

function restock(d, onDone) {
  formModal(`Restock — ${d.name}`, [
    { name: 'addStock', label: `Quantity to add (current: ${d.stock} ${d.unit})`, type: 'number', min: '1', value: 100 },
    { name: 'batchNo', label: 'Batch number', value: d.batchNo, required: false },
    { name: 'expiryDate', label: 'Expiry date', type: 'date', value: d.expiryDate || '', required: false }
  ], async v => {
    await PUT('/api/drugs/' + d.id, v);
    toast('Stock updated');
    onDone();
  }, { submitLabel: 'Restock' });
}

function drugFields(d = {}) {
  return [
    { name: 'name', label: 'Drug name & strength', value: d.name || '', full: true },
    { name: 'genericName', label: 'Generic name', value: d.genericName || '', required: false },
    { name: 'category', label: 'Category', value: d.category || '', required: false },
    { name: 'unit', label: 'Unit', type: 'select', options: ['Tablet', 'Capsule', 'Vial', 'Sachet', 'Bottle', 'Inhaler', 'Tube', 'Unit'], value: d.unit || 'Tablet', placeholder: false },
    { name: 'price', label: 'Unit price ($)', type: 'number', min: '0', step: '0.01', value: d.price ?? '' },
    { name: 'stock', label: d.id ? 'Stock count' : 'Opening stock', type: 'number', min: '0', value: d.stock ?? 0 },
    { name: 'reorderLevel', label: 'Reorder level', type: 'number', min: '0', value: d.reorderLevel ?? 50 },
    { name: 'batchNo', label: 'Batch number', value: d.batchNo || '', required: false },
    { name: 'expiryDate', label: 'Expiry date', type: 'date', value: d.expiryDate || '', required: false }
  ];
}

function addDrug(onDone) {
  formModal('Add Drug to Inventory', drugFields(), async v => {
    await POST('/api/drugs', v);
    toast('Drug added');
    onDone();
  }, { twoCol: true, wide: true, submitLabel: 'Add Drug' });
}

function editDrug(d, onDone) {
  formModal('Edit Drug — ' + d.name, drugFields(d), async v => {
    await PUT('/api/drugs/' + d.id, v);
    toast('Drug updated');
    onDone();
  }, { twoCol: true, wide: true });
}