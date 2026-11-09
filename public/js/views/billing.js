import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, modal, icon, fmtDate, fmtDateTime, fmtMoney, tabs, patientLabel } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  let statusFilter = '';

  async function drawInvoices() {
    const list = await GET('/api/invoices' + (statusFilter ? '?status=' + statusFilter : ''));
    clear(holder);
    const totals = list.reduce((a, i) => ({ total: a.total + i.total, paid: a.paid + i.paid, balance: a.balance + i.balance }), { total: 0, paid: 0, balance: 0 });
    holder.appendChild(h('div', { class: 'toolbar' },
      h('select', {
        onchange: e => { statusFilter = e.target.value; drawInvoices(); }
      }, [['', 'All invoices'], ['unpaid', 'Unpaid'], ['partial', 'Partially paid'], ['paid', 'Paid']].map(([v, l]) =>
        h('option', { value: v, selected: v === statusFilter }, l))),
      h('div', { class: 'spacer' }),
      h('span', { class: 'td-sub' }, `Billed ${fmtMoney(totals.total)} · Collected ${fmtMoney(totals.paid)} · Outstanding ${fmtMoney(totals.balance)}`)));
    holder.appendChild(card(null, table([
      { label: 'Invoice #', render: i => h('span', { class: 'td-main' }, i.number) },
      { label: 'Patient', render: i => h('div', null, h('div', { class: 'td-main' }, i.patientName), h('div', { class: 'td-sub' }, i.patientMrn)) },
      { label: 'Date', render: i => fmtDate(i.createdAt) },
      { label: 'Total', num: true, render: i => fmtMoney(i.total) },
      { label: 'Paid', num: true, render: i => fmtMoney(i.paid) },
      { label: 'Balance', num: true, render: i => h('b', { style: { color: i.balance > 0 ? 'var(--danger)' : 'var(--ok)' } }, fmtMoney(i.balance)) },
      { label: 'Status', render: i => badge(i.status) }
    ], list, { onRowClick: i => invoiceDetail(i.id, drawInvoices), emptyText: 'No invoices found' }), { flush: true }));
    holder.appendChild(h('div', { style: { marginTop: '14px' } },
      h('button', { class: 'btn btn-primary', onclick: () => newInvoice(drawInvoices) }, icon('plus'), 'New Invoice')));
  }

  async function drawServices() {
    const services = await GET('/api/services');
    clear(holder);
    const canEdit = ['admin', 'accountant'].includes(ctx.user.role);
    holder.appendChild(card(null, table([
      { label: 'Service', render: s => h('span', { class: 'td-main' }, s.name) },
      { label: 'Category', key: 'category' },
      { label: 'Price', num: true, render: s => fmtMoney(s.price) },
      { label: '', render: s => canEdit ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editService(s, drawServices) }, icon('edit')) : '' }
    ], services), { flush: true }));
    if (canEdit) holder.appendChild(h('div', { style: { marginTop: '14px' } },
      h('button', { class: 'btn btn-primary', onclick: () => editService(null, drawServices) }, icon('plus'), 'Add Service')));
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Billing & Payments'), h('div', { class: 'page-sub' }, 'Invoices are auto-generated from consultations, labs, pharmacy and bed charges'))));
  root.appendChild(tabs([{ id: 'inv', label: 'Invoices' }, { id: 'svc', label: 'Service Price List' }],
    id => id === 'inv' ? drawInvoices() : drawServices()));
  root.appendChild(holder);
  await drawInvoices();
}

async function invoiceDetail(id, onChange) {
  const inv = await GET('/api/invoices/' + id);
  const itemsTable = table([
    { label: 'Description', key: 'desc' },
    { label: 'Qty', num: true, key: 'qty' },
    { label: 'Price', num: true, render: r => fmtMoney(r.price) },
    { label: 'Amount', num: true, render: r => fmtMoney(r.total) }
  ], inv.items);
  const payTable = inv.payments.length ? table([
    { label: 'Date', render: p => fmtDateTime(p.date) },
    { label: 'Method', key: 'method' },
    { label: 'Received by', key: 'by' },
    { label: 'Amount', num: true, render: p => fmtMoney(p.amount) }
  ], inv.payments) : h('div', { class: 'td-sub' }, 'No payments yet');

  const paper = h('div', { class: 'invoice-paper' },
    h('div', { class: 'inv-head' },
      h('div', null, h('b', { style: { fontSize: '16px' } }, 'MedCore International Hospital'), h('div', { class: 'td-sub' }, 'Hospital billing · USD demo prices')),
      h('div', { style: { textAlign: 'right' } },
        h('b', {}, inv.number), h('div', { class: 'td-sub' }, fmtDate(inv.createdAt)), badge(inv.status))),
    h('div', { style: { marginBottom: '12px' } }, h('b', {}, inv.patientName), h('span', { class: 'td-sub' }, ` · ${inv.patientMrn}`)),
    itemsTable,
    h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'inv-total-row' }, h('span', {}, 'Total billed'), h('span', null, fmtMoney(inv.total))),
      h('div', { class: 'inv-total-row' }, h('span', {}, 'Paid'), h('span', null, fmtMoney(inv.paid))),
      h('div', { class: 'inv-total-row grand' }, h('span', {}, 'Balance due'), h('span', null, fmtMoney(inv.balance)))),
    h('div', { class: 'section-title' }, 'Payment history'), payTable);

  const footer = [
    h('button', { class: 'btn btn-outline', onclick: () => window.print() }, icon('print'), 'Print'),
    inv.status !== 'paid' ? h('button', {
      class: 'btn btn-outline',
      onclick: () => addItem(inv, () => { m.close(); invoiceDetail(id, onChange); })
    }, icon('plus'), 'Add Item') : null,
    inv.status !== 'paid' ? h('button', {
      class: 'btn btn-primary',
      onclick: () => takePayment(inv, () => { m.close(); invoiceDetail(id, onChange); })
    }, icon('money'), 'Record Payment') : null
  ];
  const m = modal(`Invoice ${inv.number}`, paper, { wide: true, footer });
}

function takePayment(inv, onDone) {
  formModal(`Record Payment — ${inv.number}`, [
    { name: 'amount', label: `Amount (balance: ${fmtMoney(inv.balance)})`, type: 'number', min: '0.01', step: '0.01', max: String(inv.balance), value: inv.balance },
    { name: 'method', label: 'Payment method', type: 'select', options: ['Cash', 'Card', 'Mobile Money', 'Bank Transfer', 'Insurance'], value: 'Cash', placeholder: false },
    { name: 'reference', label: 'Reference / transaction ID', required: false, full: true }
  ], async v => {
    await POST(`/api/invoices/${inv.id}/payments`, v);
    toast('Payment recorded');
    onDone();
  }, { twoCol: true, submitLabel: 'Record Payment' });
}

function addItem(inv, onDone) {
  GET('/api/services').then(services => {
    formModal('Add Invoice Item', [
      { name: 'serviceId', label: 'From price list (or enter custom below)', type: 'select', required: false, options: services.map(s => ({ value: s.id, label: `${s.name} — ${fmtMoney(s.price)}` })), full: true },
      { name: 'desc', label: 'Description', required: false, full: true },
      { name: 'qty', label: 'Quantity', type: 'number', min: '1', value: 1 },
      { name: 'price', label: 'Unit price ($)', type: 'number', min: '0', step: '0.01', required: false }
    ], async v => {
      let desc = v.desc, price = v.price;
      if (v.serviceId) {
        const s = services.find(x => x.id === v.serviceId);
        desc = desc || s.name;
        price = price === null ? s.price : price;
      }
      if (!desc || price === null) throw new Error('Pick a service or enter a description and price');
      await POST(`/api/invoices/${inv.id}/items`, { desc, qty: v.qty, price });
      toast('Item added');
      onDone();
    }, { twoCol: true, submitLabel: 'Add Item' });
  });
}

async function newInvoice(onDone) {
  const [patients, services] = await Promise.all([GET('/api/patients'), GET('/api/services')]);
  const items = [];
  const itemHolder = h('div');
  const drawItems = () => {
    clear(itemHolder);
    items.forEach((it, i) => {
      itemHolder.appendChild(h('div', { class: 'item-row' },
        h('input', { value: it.desc, placeholder: 'Description', oninput: e => it.desc = e.target.value }),
        h('input', { type: 'number', min: '1', value: it.qty, oninput: e => it.qty = Number(e.target.value) }),
        h('input', { type: 'number', min: '0', step: '0.01', value: it.price, placeholder: 'Price', oninput: e => it.price = Number(e.target.value) }),
        h('button', { class: 'icon-btn', onclick: () => { items.splice(i, 1); drawItems(); } }, icon('x'))));
    });
  };
  const svcSel = h('select', null, h('option', { value: '' }, 'Add from price list…'), services.map(s => h('option', { value: s.id }, `${s.name} — ${fmtMoney(s.price)}`)));
  svcSel.addEventListener('change', () => {
    const s = services.find(x => x.id === svcSel.value);
    if (s) { items.push({ desc: s.name, qty: 1, price: s.price }); drawItems(); }
    svcSel.value = '';
  });

  const patientSel = h('select', { required: true }, h('option', { value: '' }, 'Select patient…'), patients.map(p => h('option', { value: p.id }, patientLabel(p))));
  const form = h('form', null,
    h('div', { class: 'field' }, h('label', {}, 'Patient'), patientSel),
    h('div', { class: 'field' }, h('label', {}, 'Items'), svcSel, h('div', { style: { height: '10px' } }), itemHolder,
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => { items.push({ desc: '', qty: 1, price: 0 }); drawItems(); } }, icon('plus'), 'Custom item')));

  let m;
  const submit = h('button', { class: 'btn btn-primary' }, 'Create Invoice');
  submit.addEventListener('click', async () => {
    if (!patientSel.value) { toast('Select a patient', 'error'); return; }
    const valid = items.filter(i => i.desc && Number(i.qty) > 0);
    if (!valid.length) { toast('Add at least one item', 'error'); return; }
    submit.disabled = true;
    try {
      await POST('/api/invoices', { patientId: patientSel.value, items: valid });
      toast('Invoice created');
      m.close();
      onDone();
    } catch (err) { toast(err.message, 'error'); }
    finally { submit.disabled = false; }
  });
  m = modal('New Invoice', form, { wide: true, footer: [h('button', { class: 'btn btn-outline', onclick: () => m.close() }, 'Cancel'), submit] });
}

function editService(s, onDone) {
  formModal(s ? 'Edit Service' : 'Add Service', [
    { name: 'name', label: 'Service name', value: s?.name || '', full: true },
    { name: 'category', label: 'Category', value: s?.category || '', required: false },
    { name: 'price', label: 'Price ($)', type: 'number', min: '0', step: '0.01', value: s?.price ?? '' }
  ], async v => {
    if (s) await PUT('/api/services/' + s.id, v);
    else await POST('/api/services', v);
    toast('Service saved');
    onDone();
  }, { twoCol: true });
}