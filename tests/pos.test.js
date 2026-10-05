// Test suite for POS business logic. Run: npm test
//
// These exercise the REAL implementation in js/pos-core.js, which app.js also
// calls. That is the point of the refactor: the tests and the app share one
// copy, so they cannot silently disagree.
//
// Bugs this suite is a regression guard for:
//   - unpaid orders being deleted from the queue before payment was collected
//   - UTC vs Asia/Manila day boundaries
//   - summary totals ignoring the active filter
//   - GCash orders recording phantom change
//   - order-number search not matching
//   - quote-based XSS in attribute/JS-string contexts
//   - end-of-day export losing completed sales

const assert = require('assert');
const { describe, it } = require('node:test');
const C = require('../js/pos-core.js');

const TODAY = '2026-10-05';
const order = (over = {}) => Object.assign({
  id: 'o1', number: 'W0001', customerName: 'Maria', orderType: 'walkin',
  type: 'completed', paid: true, total: 250, timestamp: '5:23 PM',
  items: [{ name: 'Chopsuey', quantity: 1, total: 250 }]
}, over);

describe('getToday - Asia/Manila, never UTC', () => {
  // 18:00 UTC is already the next calendar day in Manila (+8).
  it('rolls over at Manila midnight, not UTC midnight', () => {
    assert.strictEqual(C.getToday(new Date('2026-10-04T15:59:59Z')), '2026-10-04');
    assert.strictEqual(C.getToday(new Date('2026-10-04T16:00:00Z')), '2026-10-05');
  });
  it('agrees with UTC from 8:00 AM Manila onward', () => {
    assert.strictEqual(C.getToday(new Date('2026-10-05T00:00:00Z')), '2026-10-05');
    assert.strictEqual(C.getToday(new Date('2026-10-05T10:00:00Z')), '2026-10-05');
  });
  it('would have filed a 2 AM order under the wrong day via UTC', () => {
    const d = new Date('2026-10-04T18:00:00Z');
    assert.notStrictEqual(d.toISOString().split('T')[0], C.getToday(d));
  });
  it('returns YYYY-MM-DD', () => {
    assert.match(C.getToday(new Date()), /^\d{4}-\d{2}-\d{2}$/);
  });
  it('defaults to now when no argument is given', () => {
    assert.strictEqual(C.getToday().length, 10);
  });
});

describe('shouldDeleteAfterCompletion - never lose an uncollected sale', () => {
  it('keeps an UNPAID order even when every station has finished', () => {
    const o = order({ paid: false, type: 'pending', kitchenCompleted: true });
    assert.strictEqual(C.shouldDeleteAfterCompletion(o, 'kitchen'), false);
  });
  it('keeps an UNPAID mixed order after both stations finish', () => {
    const o = order({
      paid: false, kitchenCompleted: true, pbqCompleted: true,
      items: [{ name: 'Chopsuey' }, { name: 'Frenchie', category: 'PBQ' }]
    });
    assert.strictEqual(C.shouldDeleteAfterCompletion(o, 'kitchen'), false);
  });
  it('deletes a PAID kitchen-only order once kitchen finishes', () => {
    const o = order({ paid: true, kitchenCompleted: true });
    assert.strictEqual(C.shouldDeleteAfterCompletion(o, 'kitchen'), true);
  });
  it('keeps a PAID mixed order until the other station finishes', () => {
    const o = order({
      paid: true, kitchenCompleted: true,
      items: [{ name: 'Chopsuey' }, { name: 'Frenchie', category: 'PBQ' }]
    });
    assert.strictEqual(C.shouldDeleteAfterCompletion(o, 'kitchen'), false);
  });
  it('deletes a PAID mixed order when the last station finishes', () => {
    const o = order({
      paid: true, kitchenCompleted: true, pbqCompleted: true,
      items: [{ name: 'Chopsuey' }, { name: 'Frenchie', category: 'PBQ' }]
    });
    assert.strictEqual(C.shouldDeleteAfterCompletion(o, 'pbq'), true);
  });
  it('treats an unknown station as a no-op', () => {
    assert.strictEqual(C.shouldDeleteAfterCompletion(order(), 'drinks'), false);
  });
  it('handles a null order without throwing', () => {
    assert.strictEqual(C.shouldDeleteAfterCompletion(null, 'kitchen'), false);
  });
});

describe('stationVisible - kitchen sees unpaid Tawag, not unpaid walk-in', () => {
  const tawag = order({ orderType: 'tawag', type: 'pending', paid: false });
  const walkin = order({ orderType: 'walkin', type: 'completed', paid: false });

  it('shows unpaid Tawag to the kitchen', () => {
    assert.strictEqual(C.stationVisible(tawag, 'kitchen'), true);
  });
  it('hides unpaid walk-in from the kitchen', () => {
    assert.strictEqual(C.stationVisible(walkin, 'kitchen'), false);
  });
  it('shows paid orders to the kitchen', () => {
    assert.strictEqual(C.stationVisible(order(), 'kitchen'), true);
  });
  it('hides an order the kitchen already completed', () => {
    assert.strictEqual(C.stationVisible(order({ kitchenCompleted: true }), 'kitchen'), false);
  });
  it('hides a PBQ-only order from the kitchen', () => {
    const pbqOnly = order({ items: [{ name: 'Frenchie', category: 'PBQ', quantity: 1, total: 27 }] });
    assert.strictEqual(C.stationVisible(pbqOnly, 'kitchen'), false);
    assert.strictEqual(C.stationVisible(pbqOnly, 'pbq'), true);
  });
  it('hides a kitchen-only order from PBQ', () => {
    assert.strictEqual(C.stationVisible(order(), 'pbq'), false);
  });
  it('respects pbqCompleted for the PBQ board', () => {
    assert.strictEqual(C.stationVisible(order({ pbqCompleted: true }), 'pbq'), false);
  });
});

describe('isPendingOrder', () => {
  it('treats type=pending as pending', () => {
    assert.strictEqual(C.isPendingOrder(order({ type: 'pending' })), true);
  });
  it('treats paid=false as pending', () => {
    assert.strictEqual(C.isPendingOrder(order({ paid: false })), true);
  });
  it('excludes completed paid orders', () => {
    assert.strictEqual(C.isPendingOrder(order()), false);
  });
});

describe('money: cart total, cash required, submission', () => {
  it('sums item totals and adds eco bags', () => {
    const items = [{ total: 250 }, { total: 320 }];
    assert.strictEqual(C.cartTotal(items, 2), 250 + 320 + 2 * 5);
  });
  it('treats a missing ecoBagCount as zero', () => {
    assert.strictEqual(C.cartTotal([{ total: 100 }]), 100);
  });
  it('cannot go NaN when an item lacks .total', () => {
    assert.strictEqual(C.cartTotal([{ name: 'x' }, { total: 100 }]), 100);
  });
  it('requires the full total for a plain cash payment', () => {
    assert.strictEqual(C.getCashRequired({ splitPayment: false, currentTotal: 250, gcashAmount: 0 }), 250);
  });
  it('requires only the cash portion for a split payment', () => {
    assert.strictEqual(C.getCashRequired({ splitPayment: true, currentTotal: 500, gcashAmount: 400 }), 100);
  });
  it('never requires negative cash', () => {
    assert.strictEqual(C.getCashRequired({ splitPayment: true, currentTotal: 100, gcashAmount: 500 }), 0);
  });
  it('rejects a split payment with no GCash entered', () => {
    const err = C.canSubmitPayment({ splitPayment: true, currentTotal: 500, gcashAmount: 0, paidAmount: 500 });
    assert.match(err, /GCash/i);
  });
  it('rejects underpayment', () => {
    assert.ok(C.canSubmitPayment({ splitPayment: false, currentTotal: 250, gcashAmount: 0, paidAmount: 200 }));
  });
  it('accepts exact payment', () => {
    assert.strictEqual(C.canSubmitPayment({ splitPayment: false, currentTotal: 250, gcashAmount: 0, paidAmount: 250 }), null);
  });
  it('accepts overpayment', () => {
    assert.strictEqual(C.canSubmitPayment({ splitPayment: false, currentTotal: 250, gcashAmount: 0, paidAmount: 500 }), null);
  });
  it('accepts a valid split payment', () => {
    const s = { splitPayment: true, currentTotal: 500, gcashAmount: 400, paidAmount: 100 };
    assert.strictEqual(C.canSubmitPayment(s), null);
  });
});

describe('changeSuggestions - GCash never records change', () => {
  it('offers nothing for GCash', () => {
    assert.deepStrictEqual(C.changeSuggestions('GCash', 500, 500), []);
  });
  it('offers nothing for GCash even if somehow overpaying', () => {
    assert.deepStrictEqual(C.changeSuggestions('GCash', 600, 500), []);
  });
  it('offers suggestions for cash', () => {
    assert.ok(C.changeSuggestions('Cash', 500, 500).length > 0);
  });
  it('suggests only amounts yielding positive change', () => {
    assert.ok(C.changeSuggestions('Cash', 500, 500).every(s => s.change > 0));
  });
  it('first suggestion is exact +1', () => {
    assert.deepStrictEqual(C.changeSuggestions('Cash', 500, 500)[0], { paid: 501, change: 1 });
  });
  it('is always populated when paid >= required (the only reachable case)', () => {
    // calculateChange() only runs after canSubmitPayment() passes, so
    // paidAmount >= required always holds when suggestions are shown.
    for (const [paid, req] of [[500, 500], [600, 500], [1000, 1000], [250, 200]]) {
      const s = C.changeSuggestions('Cash', paid, req);
      assert.ok(s.length > 0, `paid=${paid} req=${req}`);
      assert.ok(s.every(x => x.change > 0));
    }
  });
  it('is internally consistent (change always equals paid - required)', () => {
    for (const s of C.changeSuggestions('Cash', 250, 250)) {
      assert.strictEqual(s.change, s.paid - 250);
    }
  });
});

describe('keypad arithmetic', () => {
  it('appends digits', () => {
    assert.strictEqual(C.applyDigit(12, 5), 125);
    assert.strictEqual(C.applyDigit(0, 7), 7);
  });
  it('backspaces by dropping the last digit', () => {
    assert.strictEqual(C.backspaceDigit(125), 12);
    assert.strictEqual(C.backspaceDigit(5), 0);
  });
  it('caps GCash but never caps cash tendered', () => {
    assert.strictEqual(C.addCapped(400, 200, 500), 500);
    assert.strictEqual(C.addCapped(100, 1000, 500), 500);
    assert.strictEqual(C.addCapped(100, 1000, Infinity), 1100);
  });
  it('zero-pads order numbers to four digits', () => {
    assert.strictEqual(C.generateOrderNumber(42), 'W0042');
    assert.strictEqual(C.generateOrderNumber(1234), 'W1234');
    assert.strictEqual(C.generateOrderNumber(1), 'W0001');
  });
});

describe('search', () => {
  const o = order({ number: 'W0042', orderType: 'tawag', type: 'pending' });
  it('matches by order number', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'w0042'), true);
    assert.strictEqual(C.orderMatchesSearch(o, 'W0042'), true);
  });
  it('matches by customer name', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'maria'), true);
  });
  it('matches by item name', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'chopsuey'), true);
  });
  it('matches by channel', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'tawag'), true);
  });
  it('supports multi-token queries', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'maria chopsuey'), true);
  });
  it('requires every token to match', () => {
    assert.strictEqual(C.orderMatchesSearch(o, 'maria zzz'), false);
  });
  it('matches everything on an empty term', () => {
    assert.strictEqual(C.orderMatchesSearch(o, '   '), true);
  });
  it('handles a missing number without throwing', () => {
    assert.strictEqual(C.orderMatchesSearch(order({ number: undefined }), 'maria'), true);
  });
  it('searches menu items by name, category and price', () => {
    const item = { name: 'Frenchie', category: 'PBQ', price: 27 };
    assert.strictEqual(C.menuItemMatchesSearch(item, 'frenchie'), true);
    assert.strictEqual(C.menuItemMatchesSearch(item, 'pbq'), true);
    assert.strictEqual(C.menuItemMatchesSearch(item, '27'), true);
    assert.strictEqual(C.menuItemMatchesSearch(item, 'zzz'), false);
  });
  it('filters by channel', () => {
    assert.strictEqual(C.orderMatchesTypeFilter(o, 'tawag'), true);
    assert.strictEqual(C.orderMatchesTypeFilter(o, 'walkin'), false);
    assert.strictEqual(C.orderMatchesTypeFilter(o, 'all'), true);
  });
  it('escapes HTML when highlighting', () => {
    const out = C.highlightMatch('<script>', 'script');
    assert.ok(!out.includes('<script>'));
    assert.ok(out.includes('<mark>'));
  });
  it('does not throw on regex metacharacters in the term', () => {
    assert.doesNotThrow(() => C.highlightMatch('a+b', 'a+b'));
    assert.doesNotThrow(() => C.highlightMatch('cost (2)', '('));
  });
});

describe('summaryTotals - honours the rows it is given', () => {
  const H = [
    order({ paymentMethod: 'Cash', total: 100 }),
    order({ paymentMethod: 'Cash', total: 200 }),
    order({ paymentMethod: 'Cash', total: 150, orderType: 'tawag' }),
    order({ paymentMethod: 'GCash', total: 500 }),
    order({ paymentMethod: 'GCash', total: 400, orderType: 'tawag' }),
    order({ paymentMethod: 'Split', total: 500, cashAmount: 100, gcashAmount: 400 }),
    order({ paymentMethod: 'Split', total: 250, cashAmount: 200, gcashAmount: 50 }),
  ];
  it('splits drawer vs wallet correctly for cash', () => {
    const t = C.summaryTotals([H[0]]);
    assert.deepStrictEqual([t.cashTotal, t.gcashTotal, t.grand], [100, 0, 100]);
  });
  it('counts a GCash sale in full against the wallet', () => {
    const t = C.summaryTotals([H[3]]);
    assert.deepStrictEqual([t.cashTotal, t.gcashTotal, t.grand], [0, 500, 500]);
  });
  it('counts a split sale by its real components, not the total', () => {
    const t = C.summaryTotals([H[5]]);
    assert.deepStrictEqual([t.cashTotal, t.gcashTotal, t.grand], [100, 400, 500]);
  });
  it('tracks split count and split components', () => {
    const t = C.summaryTotals(H);
    assert.strictEqual(t.splitCount, 2);
    assert.deepStrictEqual([t.splitCash, t.splitGcash], [300, 450]);
  });
  it('grand total always equals cash + wallet', () => {
    for (let n = 0; n <= H.length; n++) {
      const t = C.summaryTotals(H.slice(0, n));
      assert.strictEqual(t.grand, t.cashTotal + t.gcashTotal);
    }
  });
  it('handles an empty set', () => {
    const t = C.summaryTotals([]);
    assert.deepStrictEqual([t.cashTotal, t.gcashTotal, t.grand, t.count], [0, 0, 0, 0]);
  });
});

describe('applySummaryFilters - date scope then channel', () => {
  const H = [
    { date: TODAY, orderType: 'walkin', paymentMethod: 'Cash', total: 100 },
    { date: TODAY, orderType: 'walkin', paymentMethod: 'Cash', total: 200 },
    { date: TODAY, orderType: 'tawag', paymentMethod: 'Cash', total: 150 },
    { date: TODAY, orderType: 'walkin', paymentMethod: 'GCash', total: 500 },
    { date: TODAY, orderType: 'tawag', paymentMethod: 'GCash', total: 400 },
    { date: TODAY, orderType: 'walkin', paymentMethod: 'Split', total: 500, cashAmount: 100, gcashAmount: 400 },
    { date: TODAY, orderType: 'tawag', paymentMethod: 'Split', total: 250, cashAmount: 200, gcashAmount: 50 },
    { date: '2026-10-04', orderType: 'walkin', paymentMethod: 'Cash', total: 999 },
  ];
  const run = (scope, ch) => C.summaryTotals(C.applySummaryFilters(H, scope, ch, TODAY));
  it('today + all channels totals 2100', () => {
    assert.strictEqual(run('today', 'all').grand, 2100);
  });
  it('today + walkin excludes GCash and Split', () => {
    assert.deepStrictEqual([run('today', 'walkin').cashTotal, run('today', 'walkin').count], [300, 2]);
  });
  it('today + tawag', () => {
    assert.deepStrictEqual([run('today', 'tawag').cashTotal, run('today', 'tawag').count], [150, 1]);
  });
  it('today + gcash', () => {
    assert.deepStrictEqual([run('today', 'gcash').cashTotal, run('today', 'gcash').gcashTotal], [0, 900]);
  });
  it('today + split', () => {
    assert.deepStrictEqual([run('today', 'split').cashTotal, run('today', 'split').gcashTotal], [300, 450]);
  });
  it('today scope excludes other days', () => {
    assert.ok(!C.applySummaryFilters(H, 'today', 'all', TODAY).some(t => t.date !== TODAY));
  });
  it('all scope includes other days', () => {
    assert.strictEqual(C.applySummaryFilters(H, 'all', 'all', TODAY).length, 8);
  });
  it('all scope + gcash still totals 900 for that channel', () => {
    assert.strictEqual(run('all', 'gcash').gcashTotal, 900);
  });
  it('falls back to today when no day is passed', () => {
    assert.strictEqual(C.applySummaryFilters(H, 'today', 'all').length, 7);
  });
  it('handles a null row set', () => {
    assert.deepStrictEqual(C.applySummaryFilters(null, 'all', 'all', TODAY), []);
  });
});

describe('pendingTotals', () => {
  it('splits walk-in and tawag unpaid totals', () => {
    const t = C.pendingTotals([
      { orderType: 'walkin', total: 100 }, { orderType: 'tawag', total: 250 },
      { orderType: 'tawag', total: 50 }
    ]);
    assert.deepStrictEqual(
      [t.grandTotal, t.walkinTotal, t.tawagTotal, t.walkinCount, t.tawagCount],
      [400, 100, 300, 1, 2]
    );
  });
  it('handles an empty pending list', () => {
    assert.strictEqual(C.pendingTotals([]).grandTotal, 0);
  });
});

describe('itemSalesBreakdown', () => {
  it('aggregates quantities and totals per item', () => {
    const s = C.itemSalesBreakdown([
      { items: [{ name: 'Chopsuey', quantity: 2, total: 500 }] },
      { items: [{ name: 'Chopsuey', quantity: 1, total: 250 }] }
    ]).sales;
    assert.deepStrictEqual(s['Chopsuey'], { qty: 3, total: 750 });
  });
  it('rolls eco bags into their own line at the standard price', () => {
    const b = C.itemSalesBreakdown([{ items: [], ecoBags: 3 }]);
    assert.deepStrictEqual(b.sales['Eco Bag'], { qty: 3, total: 15 });
    assert.strictEqual(b.ecoBagQty, 3);
  });
});

describe('XSS escaping is safe AND lossless', () => {
  const PAYLOADS = [
    'x" onclick="alert(1)', "y' onclick='alert(2)", 'a"><img src=x onerror=alert(3)>',
    "b');alert(4);//", 'c\\', "d\\';alert(5);//", '</script><script>alert(6)</script>',
    'plain name', "O'Brien & Sons", '₱250 Chopsuey', '<b>bold</b>'
  ];
  const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  it('never leaves a raw quote in an attribute context', () => {
    for (const p of PAYLOADS) assert.ok(!C.escapeHtmlAttr(p).includes('"'), p);
  });
  it('round-trips the exact name through an inline onclick handler', () => {
    for (const p of PAYLOADS) {
      let captured = null;
      const updateQuantity = n => { captured = n; };
      new Function('updateQuantity', decode(`updateQuantity('${C.jsStringArg(p)}',-1)`))(updateQuantity);
      assert.strictEqual(captured, p, `payload: ${p}`);
    }
  });
  it('cannot inject a second attribute', () => {
    const attr = `onclick="updateQuantity('${C.jsStringArg('x" onclick="alert(1)')}',-1)"`;
    assert.ok(!attr.split('onclick=')[1].includes('" onclick="'));
  });
  it('escapes markup but not ordinary punctuation', () => {
    assert.strictEqual(C.escapeHtml('<b>&'), '&lt;b&gt;&amp;');
    assert.strictEqual(C.escapeHtmlAttr(`"'`), '&quot;&#39;');
  });
});

// Minimal RFC4180 field splitter: respects quoted fields, so a name like
// 'Doe, Jane' still counts as ONE column.
function parseCsvLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

describe('CSV escaping', () => {
  it('quotes values containing commas, quotes or newlines', () => {
    assert.strictEqual(C.csvCell('a,b'), '"a,b"');
    assert.strictEqual(C.csvCell('say "hi"'), '"say ""hi"""');
    assert.strictEqual(C.csvCell('a\nb'), '"a\nb"');
  });
  it('leaves plain values alone', () => {
    assert.strictEqual(C.csvCell('Chopsuey'), 'Chopsuey');
    assert.strictEqual(C.csvCell(250), '250');
    assert.strictEqual(C.csvCell(0), '0');
  });
  it('renders null and undefined as empty, not "undefined"', () => {
    assert.strictEqual(C.csvCell(null), '');
    assert.strictEqual(C.csvCell(undefined), '');
  });
  it('summarises items as name×qty', () => {
    assert.strictEqual(C.itemsSummary([{ name: 'A', quantity: 1 }, { name: 'B', quantity: 3 }]), 'A×1; B×3');
    assert.strictEqual(C.itemsSummary([]), '');
    assert.strictEqual(C.itemsSummary(undefined), '');
  });
});

describe('end-of-day export - keeps every sale', () => {
  const historyData = {
    h1: { date: TODAY, number: 'W0001', total: 250, paymentMethod: 'Cash', paid: 500, change: 250, timestamp: '5:23 PM', customerName: 'Ana', items: [{ name: 'Chopsuey', quantity: 1 }] },
    h2: { date: TODAY, number: 'W0002', total: 400, paymentMethod: 'GCash', paid: 400, change: 0, timestamp: '6:02 PM', customerName: '', items: [{ name: 'Fish Tinola', quantity: 1 }] },
    h3: { date: '2026-10-04', number: 'W0099', total: 999, paymentMethod: 'Cash', paid: 999, change: 0, timestamp: '9:00 PM' },
  };
  const orderData = {
    o1: { date: TODAY, number: 'W0003', type: 'pending', paid: false, total: 300, paymentMethod: 'pending', timestamp: '7:15 PM', customerName: 'Rico', items: [{ name: 'Lomi', quantity: 1 }] },
    // Already completed and therefore deleted from the queue: it survives ONLY in history.
    o2: { date: TODAY, number: 'W0001', total: 250, paymentMethod: 'Cash', paid: true, kitchenCompleted: true, timestamp: '5:23 PM' },
  };

  it('takes PAID rows from history, not from the live queue', () => {
    assert.strictEqual(C.selectEndOfDayRows(historyData, orderData, TODAY).sold.length, 2);
  });
  it('excludes other days from sales', () => {
    assert.ok(!C.selectEndOfDayRows(historyData, orderData, TODAY).sold.some(t => t.date !== TODAY));
  });
  it('still surfaces an uncollected order so it is not silently lost', () => {
    assert.ok(C.selectEndOfDayRows(historyData, orderData, TODAY).open.some(o => o.number === 'W0003'));
  });
  it('does not re-export an already-paid open order', () => {
    const rows = C.selectEndOfDayRows(historyData, orderData, TODAY);
    assert.ok(!rows.open.some(o => o.number === 'W0001' && o.paid === true));
    assert.strictEqual(rows.open.length, 1);
  });
  it('handles missing history and order nodes', () => {
    const rows = C.selectEndOfDayRows(null, null, TODAY);
    assert.deepStrictEqual([rows.sold.length, rows.open.length], [0, 0]);
  });

  it('emits a header and one line per row', () => {
    const { sold, open } = C.selectEndOfDayRows(historyData, orderData, TODAY);
    const lines = C.buildSalesCsv(sold, open, TODAY).trim().split('\n');
    assert.strictEqual(lines.length, sold.length + open.length + 1);
    assert.strictEqual(lines[0], C.SALES_HEADER);
  });
  it('writes 13 columns per row even with commas in names', () => {
    const sold = [{ date: TODAY, number: 'W1', customerName: 'Doe, Jane', total: 100, paymentMethod: 'Cash', paid: 100, items: [{ name: 'Chopsuey', quantity: 1 }] }];
    const row = parseCsvLine(C.buildSalesCsv(sold, [], TODAY).trim().split('\n')[1]);
    assert.strictEqual(row.length, C.SALES_HEADER.split(',').length);
    assert.strictEqual(row[4], 'Doe, Jane');
  });
  it('marks status PAID vs UNPAID', () => {
    const { sold, open } = C.selectEndOfDayRows(historyData, orderData, TODAY);
    const lines = C.buildSalesCsv(sold, open, TODAY).trim().split('\n');
    assert.strictEqual(lines.filter(l => l.endsWith('PAID') && !l.endsWith('UNPAID')).length, sold.length);
    assert.strictEqual(lines.filter(l => l.endsWith('UNPAID')).length, open.length);
  });
  it('reports cash tendered, not order total, for cash sales', () => {
    const sold = [{ date: TODAY, total: 250, paymentMethod: 'Cash', paid: 500, change: 250, items: [] }];
    const row = parseCsvLine(C.buildSalesCsv(sold, [], TODAY).trim().split('\n')[1]);
    assert.strictEqual(row[7], '250');   // Total
    assert.strictEqual(row[9], '500');   // CashTendered
    assert.strictEqual(row[11], '250');  // Change
  });
  it('reports the cash component for split sales', () => {
    const sold = [{ date: TODAY, total: 500, paymentMethod: 'Split', paid: 500, cashAmount: 100, gcashAmount: 400, items: [] }];
    const row = C.buildSalesCsv(sold, [], TODAY).trim().split('\n')[1];
    assert.ok(row.includes('100'));
    assert.ok(row.includes('400'));
  });
  it('writes a header even with no rows', () => {
    assert.strictEqual(C.buildSalesCsv([], [], TODAY).trim(), C.SALES_HEADER);
  });
});