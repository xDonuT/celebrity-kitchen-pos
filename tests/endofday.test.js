// Tests for the end-of-day export. Run: npm test
// These guard the fix for: endOfDay exported the partial order queue instead
// of the complete transaction history, and had no CSV escaping.

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  ->  ' + extra : ''}`); }
}
function group(t) { console.log(`\n${t}`); }

// csvCell — app.js:1548
function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function itemsSummary(items) {
  return (items || []).map(i => i.name + '×' + i.quantity).join('; ');
}

// End-of-day row selection: PAID rows come from history (complete record),
// UNPAID rows come from the still-open queue so they are not silently lost.
function selectRows(histData, ordData, today) {
  const sold = histData
    ? Object.keys(histData).map(k => ({ id: k, ...histData[k] })).filter(t => t.date === today)
    : [];
  const open = ordData
    ? Object.keys(ordData).map(k => ({ id: k, ...ordData[k] })).filter(o => o.date !== today || o.paid === false)
    : [];
  return { sold, open };
}

group('csvCell escapes correctly');
ok('plain value untouched', csvCell('Chopsuey') === 'Chopsuey');
ok('null becomes empty string', csvCell(null) === '');
ok('undefined becomes empty string', csvCell(undefined) === '');
ok('number passes through', csvCell(250) === '250');
ok('zero is preserved', csvCell(0) === '0');
ok('comma forces quoting', csvCell('a,b') === '"a,b"', csvCell('a,b'));
ok('double quote is doubled', csvCell('say "hi"') === '"say ""hi"""', csvCell('say "hi"'));
ok('newline forces quoting', csvCell('a\nb') === '"a\nb"');
ok('embedded quote+comma handled', csvCell('a,"b"') === '"a,""b"""', csvCell('a,"b"'));

group('itemsSummary');
ok('formats name×qty', itemsSummary([{ name: 'Chopsuey', quantity: 2 }]) === 'Chopsuey×2');
ok('joins multiple with semicolon', itemsSummary([{ name: 'A', quantity: 1 }, { name: 'B', quantity: 3 }]) === 'A×1; B×3');
ok('handles empty order', itemsSummary([]) === '');
ok('handles missing items', itemsSummary(undefined) === '');

group('endOfDay exports the COMPLETE record');
// The bug: kitchen completion DELETES paid orders from orders/<today>, so
// exporting only that node silently lost every finished sale.
const TODAY = '2026-10-05';
const histData = {
  h1: { date: TODAY, number: 'W0001', total: 250, paymentMethod: 'Cash', paid: 500, change: 250, timestamp: '5:23 PM', customerName: 'Ana', items: [{ name: 'Chopsuey', quantity: 1 }] },
  h2: { date: TODAY, number: 'W0002', total: 400, paymentMethod: 'GCash', paid: 400, change: 0, timestamp: '6:02 PM', customerName: '', items: [{ name: 'Fish Tinola', quantity: 1 }] },
  h3: { date: '2026-10-04', number: 'W0099', total: 999, paymentMethod: 'Cash', paid: 999, change: 0, timestamp: '9:00 PM' },
};
const ordData = {
  o1: { date: TODAY, number: 'W0003', type: 'pending', paid: false, total: 300, paymentMethod: 'pending', timestamp: '7:15 PM', customerName: 'Rico', items: [{ name: 'Lomi', quantity: 1 }] },
  o2: { date: TODAY, number: 'W0001', total: 250, paymentMethod: 'Cash', paid: true, kitchenCompleted: true, timestamp: '5:23 PM' },
};
const r = selectRows(histData, ordData, TODAY);
ok('includes every PAID sale from history', r.sold.length === 2, `got ${r.sold.length}`);
ok('excludes other days from sales', !r.sold.some(t => t.date !== TODAY));
ok('captures cash tendered + change', r.sold[0].paid === 500 && r.sold[0].change === 250);
ok('captures still-unpaid Tawag orders', r.open.some(o => o.number === 'W0003'));
ok('does NOT re-export already-paid open orders', !r.open.some(o => o.number === 'W0001' && o.paid === true));
ok('paid open order absent from queue is still counted as sold', r.sold.length === 2 && r.open.length === 1);

group('CSV header and shape');
const HEADER = 'Time,Date,Order#,Type,Customer,Items,EcoBags,Total,Payment,CashTendered,GCash,Change,Status';
ok('header has 13 columns', HEADER.split(',').length === 13, String(HEADER.split(',').length));
ok('header carries no unsubtitled placeholder', !HEADER.includes('Subtotal'));
const paidRow = [r.sold[0].timestamp, r.sold[0].date, r.sold[0].number, 'walkin', r.sold[0].customerName, itemsSummary(r.sold[0].items), 0, r.sold[0].total, r.sold[0].paymentMethod, r.sold[0].paid, 0, r.sold[0].change, 'PAID'].map(csvCell).join(',');
ok('paid row has 13 fields', paidRow.split(',').length === 13, paidRow);
ok('paid row is marked PAID', paidRow.endsWith('PAID'));
const split = { timestamp: '8:00 PM', date: TODAY, number: 'W0004', orderType: 'walkin', customerName: '', items: [], ecoBags: 0, total: 500, paymentMethod: 'Split', paid: 500, cashAmount: 100, gcashAmount: 400, change: 0 };
const splitCash = (split.paymentMethod === 'Split' ? split.cashAmount : split.paid);
ok('split row reports cashAmount, not the total paid', splitCash === 100 && split.paid === 500);
const splitRow = [split.timestamp, split.date, split.number, split.orderType, split.customerName, itemsSummary(split.items), split.ecoBags, split.total, split.paymentMethod, splitCash, split.gcashAmount, split.change, 'PAID'].map(csvCell).join(',');
ok('split row has 13 fields', splitRow.split(',').length === 13, splitRow);
ok('split row carries gcash component', splitRow.includes('400'));
const cashRow = r.sold[0];
const cashTendered = cashRow.paymentMethod === 'Split' ? cashRow.cashAmount : cashRow.paid;
ok('cash row reports cash tendered (500), not order total (250)', cashTendered === 500 && cashRow.total === 250);

group('edge cases');
ok('empty history and queue yields nothing', selectRows(null, null, TODAY).sold.length === 0 && selectRows(null, null, TODAY).open.length === 0);
ok('missing ecoBags reads as 0, not NaN', (r.sold[0].ecoBags || 0) === 0);
ok('order missing number exports blank, not "undefined"', csvCell(undefined) === '');

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}  (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);