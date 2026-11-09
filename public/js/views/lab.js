import { GET, POST, PUT } from '../api.js';
import { h, clear, card, table, badge, formModal, toast, icon, fmtDate, fmtDateTime, tabs, patientLabel } from '../ui.js';

export async function render(root, ctx) {
  const holder = h('div');
  const canProcess = ['admin', 'labtech'].includes(ctx.user.role);
  const canOrder = ['admin', 'doctor'].includes(ctx.user.role);

  async function drawOrders() {
    const orders = await GET('/api/laborders');
    clear(holder);
    const pending = orders.filter(o => o.status !== 'completed').length;
    holder.appendChild(card(`${pending} pending order(s)`, table([
      { label: 'Ordered', render: o => fmtDateTime(o.createdAt) },
      { label: 'Patient', render: o => h('div', null, h('div', { class: 'td-main' }, o.patientName), h('div', { class: 'td-sub' }, o.patientMrn)) },
      { label: 'Test', render: o => h('div', null, h('div', { class: 'td-main' }, o.testName), h('div', { class: 'td-sub' }, `Sample: ${o.sampleType}`)) },
      { label: 'Ordered by', key: 'orderedByName' },
      { label: 'Status', render: o => badge(o.status) },
      { label: 'Result', render: o => o.result || '—' },
      { label: 'Actions', render: o => orderActions(o) }
    ], orders, { emptyText: 'No lab orders' }), { flush: true }));
  }

  function orderActions(o) {
    const row = h('div', { class: 'btn-row' });
    if (!canProcess || o.status === 'completed') return row;
    if (o.status === 'ordered') row.appendChild(h('button', { class: 'btn btn-outline btn-sm', onclick: () => advance(o, 'sample-collected') }, 'Collect Sample'));
    if (o.status === 'sample-collected') row.appendChild(h('button', { class: 'btn btn-outline btn-sm', onclick: () => advance(o, 'processing') }, 'Start Processing'));
    if (o.status === 'processing') row.appendChild(h('button', { class: 'btn btn-primary btn-sm', onclick: () => enterResult(o) }, 'Enter Result'));
    return row;
  }

  async function advance(o, status) {
    try { await PUT('/api/laborders/' + o.id, { status }); toast(`Order marked ${status.replace('-', ' ')}`); drawOrders(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function enterResult(o) {
    formModal(`Result — ${o.testName}`, [
      { name: 'result', label: `Result for ${o.patientName} (${o.patientMrn})`, type: 'textarea', rows: 5, full: true, placeholder: 'Enter findings, values and reference ranges…' }
    ], async v => {
      await PUT('/api/laborders/' + o.id, { status: 'completed', result: v.result });
      toast('Result saved — test billed to patient');
      drawOrders();
    }, { submitLabel: 'Complete Test' });
  }

  async function drawCatalog() {
    const tests = await GET('/api/labtests');
    clear(holder);
    holder.appendChild(card(null, table([
      { label: 'Test', render: t => h('span', { class: 'td-main' }, t.name) },
      { label: 'Category', key: 'category' },
      { label: 'Sample', key: 'sampleType' },
      { label: 'Price', num: true, render: t => '$' + Number(t.price).toFixed(2) }
    ], tests), { flush: true }));
    if (canProcess) {
      holder.appendChild(h('div', { style: { marginTop: '14px' } },
        h('button', { class: 'btn btn-primary', onclick: () => addTest(drawCatalog) }, icon('plus'), 'Add Test')));
    }
  }

  async function orderForm() {
    const [patients, tests] = await Promise.all([GET('/api/patients'), GET('/api/labtests')]);
    formModal('Order Lab Test', [
      { name: 'patientId', label: 'Patient', type: 'select', options: patients.map(p => ({ value: p.id, label: patientLabel(p) })), full: true },
      { name: 'testId', label: 'Test', type: 'select', options: tests.map(t => ({ value: t.id, label: `${t.name} — $${t.price}` })), full: true },
      { name: 'notes', label: 'Clinical notes', type: 'textarea', required: false, full: true }
    ], async v => {
      await POST('/api/laborders', v);
      toast('Lab test ordered');
      drawOrders();
    }, { submitLabel: 'Order Test' });
  }

  root.appendChild(h('div', { class: 'page-head' },
    h('div', null, h('div', { class: 'page-title' }, 'Laboratory'), h('div', { class: 'page-sub' }, 'Test orders, samples and results')),
    canOrder ? h('button', { class: 'btn btn-primary', onclick: orderForm }, icon('plus'), 'Order Test') : null));
  root.appendChild(tabs([{ id: 'orders', label: 'Test Orders' }, { id: 'catalog', label: 'Test Catalog' }],
    id => id === 'orders' ? drawOrders() : drawCatalog()));
  root.appendChild(holder);
  await drawOrders();
}

function addTest(onDone) {
  formModal('Add Lab Test', [
    { name: 'name', label: 'Test name', full: true },
    { name: 'category', label: 'Category', placeholder: 'e.g. Biochemistry' },
    { name: 'sampleType', label: 'Sample type', type: 'select', options: ['Blood', 'Urine', 'Stool', 'Swab', 'N/A'], value: 'Blood', placeholder: false },
    { name: 'price', label: 'Price ($)', type: 'number', min: '0', step: '0.01' }
  ], async v => {
    await POST('/api/labtests', v);
    toast('Test added to catalog');
    onDone();
  }, { twoCol: true });
}