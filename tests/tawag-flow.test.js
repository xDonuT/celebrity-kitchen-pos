// End-to-end check of the Tawag workflow, in the order a cashier performs it.
// This is the flow that lost money before the guard in shouldDeleteAfterCompletion:
// kitchen marking a Tawag order done used to delete it before payment, so it
// vanished from Pending and no one could collect.

const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/pos-core.js');

// Fields written by proceedWithCompletion() in app.js. Anything added there
// must exist here too, or the CSV/summary would silently read blanks.
const sale = (over = {}) => ({
  number: 'W0001', orderType: 'tawag', type: 'completed', customerName: 'Rico',
  timestamp: '7:30 PM', ecoBags: 1, total: 280, paid: true, paymentMethod: 'Cash',
  cashAmount: 280, gcashAmount: 0, date: C.getToday(),
  items: [{ name: 'Chopsuey', quantity: 1, total: 250 }],
  ...over
});

test('unpaid Tawag order is visible to both stations', () => {
  const order = {
    id: 'o1', orderType: 'tawag', type: 'pending', paid: false, total: 280,
    items: [
      { name: 'Chopsuey', quantity: 1, total: 250 },
      { name: 'Frenchie', category: 'PBQ', quantity: 1, total: 27 }
    ]
  };
  assert.strictEqual(C.stationVisible(order, 'kitchen'), true);
  assert.strictEqual(C.stationVisible(order, 'pbq'), true);
  assert.strictEqual(C.isPendingOrder(order), true);
});

test('an unpaid walk-in stays hidden from the kitchen until paid', () => {
  const walkin = { orderType: 'walkin', type: 'completed', paid: false, total: 280, items: [{ name: 'Chopsuey', quantity: 1 }] };
  assert.strictEqual(C.stationVisible(walkin, 'kitchen'), false);
});

test('cooking a Tawag order never removes the debt from Pending', () => {
  const order = {
    orderType: 'tawag', type: 'pending', paid: false, total: 280,
    items: [
      { name: 'Chopsuey', quantity: 1, total: 250 },
      { name: 'Frenchie', category: 'PBQ', quantity: 1, total: 27 }
    ]
  };

  const afterKitchen = { ...order, kitchenCompleted: true };
  assert.strictEqual(C.stationVisible(afterKitchen, 'kitchen'), false, 'kitchen clears its card');
  assert.strictEqual(C.stationVisible(afterKitchen, 'pbq'), true, 'PBQ still has work');
  assert.strictEqual(C.isPendingOrder(afterKitchen), true, 'still awaiting payment');
  assert.strictEqual(C.shouldDeleteAfterCompletion(afterKitchen, 'kitchen'), false);

  const bothDone = { ...afterKitchen, pbqCompleted: true };
  assert.strictEqual(C.shouldDeleteAfterCompletion(bothDone, 'pbq'), false, 'still unpaid: do not delete');
  assert.strictEqual(C.pendingTotals([bothDone]).grandTotal, 280, 'full amount still owed');
});

test('payment closes the order and only then may it be cleared', () => {
  const bothDone = {
    orderType: 'tawag', type: 'pending', paid: false, total: 280,
    kitchenCompleted: true, pbqCompleted: true,
    items: [{ name: 'Chopsuey', quantity: 1, total: 250 }]
  };
  assert.strictEqual(
    C.canSubmitPayment({ splitPayment: false, currentTotal: 280, gcashAmount: 0, paidAmount: 500 }),
    null
  );

  const paid = { ...bothDone, paid: true, type: 'completed', paymentMethod: 'Cash' };
  assert.strictEqual(C.isPendingOrder(paid), false);
  assert.strictEqual(C.shouldDeleteAfterCompletion(paid, 'kitchen'), true);
  assert.strictEqual(500 - 280, 220, 'change due');
});

test('a paid walk-in mixed order clears only after both stations finish', () => {
  const mixed = {
    orderType: 'walkin', paid: true, total: 280, kitchenCompleted: true,
    items: [
      { name: 'Chopsuey', quantity: 1, total: 250 },
      { name: 'Frenchie', category: 'PBQ', quantity: 1, total: 27 }
    ]
  };
  assert.strictEqual(C.stationVisible(mixed, 'kitchen'), false, 'kitchen already finished its card');
  assert.strictEqual(C.stationVisible(mixed, 'pbq'), true, 'PBQ still has work');
  assert.strictEqual(C.shouldDeleteAfterCompletion(mixed, 'kitchen'), false);
  assert.strictEqual(C.shouldDeleteAfterCompletion({ ...mixed, pbqCompleted: true }, 'pbq'), true);
});

test('the completed Tawag sale reaches the end-of-day CSV', () => {
  const today = C.getToday();
  const hist = { h1: sale({ paid: 500, change: 220 }) };
  const { sold, open } = C.selectEndOfDayRows(hist, null, today);
  assert.strictEqual(sold.length, 1);
  assert.strictEqual(open.length, 0);

  const header = C.SALES_HEADER.split(',');
  const row = C.buildSalesCsv(sold, open, today).trim().split('\n')[1];
  const cells = [];
  let cur = '', quoted = false;
  for (const ch of row) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);

  assert.strictEqual(cells.length, header.length, 'column count matches header');
  assert.strictEqual(cells[2], 'W0001', 'order number');
  assert.strictEqual(cells[3], 'tawag', 'channel');
  assert.strictEqual(cells[4], 'Rico', 'customer');
  assert.strictEqual(cells[5], 'Chopsuey×1', 'items');
  assert.strictEqual(cells[6], '1', 'eco bag quantity');
  assert.strictEqual(cells[7], '280', 'total');
  assert.strictEqual(cells[8], 'Cash', 'payment method');
  assert.strictEqual(cells[9], '500', 'cash tendered');
  assert.strictEqual(cells[10], '0', 'gcash amount');
  assert.strictEqual(cells[11], '220', 'change');
  assert.strictEqual(cells[12], 'PAID', 'status');
});