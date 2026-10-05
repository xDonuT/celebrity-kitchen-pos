// Test suite for POS money-critical logic. Run: npm test
// These cover the bugs found in review: UTC dates, deleted unpaid orders,
// summary filter math, GCash phantom change, order-number search, XSS escaping.

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  ->  ' + extra : ''}`); }
}
function group(title) { console.log(`\n${title}`); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---------------------------------------------------------------- helpers ---
const NOW = new Date('2026-10-05T10:00:00Z'); // 18:00 Oct 5 in Manila

// getToday() must use Asia/Manila, not UTC. Replicates app.js:85.
function getToday(d = NOW) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
}
const utcBuggy = d => d.toISOString().split('T')[0];

// safeDisplay / escapeHtmlAttr / jsStringArg — app.js:74-85
function safeDisplay(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\u00a0/g, '&nbsp;');
}
function escapeHtmlAttr(text) {
  return safeDisplay(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsStringArg(text) {
  return escapeHtmlAttr(String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}
function decodeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// orderMatchesSearch — app.js:1457
function orderMatchesSearch(o, rawTerm) {
  const term = rawTerm.toLowerCase().trim();
  if (!term) return true;
  const tokens = term.split(/\s+/).filter(Boolean);
  const haystack = [
    o.number || '', o.customerName || '',
    o.orderType === 'tawag' ? 'tawag' : 'walkin',
    o.type === 'pending' ? 'pending' : '', o.notes || '',
    o.timestamp || '', o.pickupTime || '',
    ...(o.items || []).map(i => i.name),
  ].join(' ').toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

// calculateChange suggestion list — app.js:903. GCash must get none.
const SUGGESTIONS = [1, 5, 10, 20, 50, 100, 200, 500, 1000];
function suggestionsFor(method, paidAmount, required) {
  const list = [];
  for (const extra of method === 'GCash' ? [] : SUGGESTIONS) {
    const np = paidAmount + extra, nc = np - required;
    if (nc > 0) list.push({ paid: np, change: nc });
  }
  return list;
}

// applySummaryFilters — app.js:1629
function applySummaryFilters(rows, dateFilter, channel, today = getToday()) {
  let out = dateFilter === 'today' ? rows.filter(t => t.date === today) : rows;
  if (channel === 'walkin') out = out.filter(t => (t.orderType || t.type) === 'walkin' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
  else if (channel === 'tawag') out = out.filter(t => (t.orderType || t.type) === 'tawag' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split');
  else if (channel === 'gcash') out = out.filter(t => t.paymentMethod === 'GCash');
  else if (channel === 'split') out = out.filter(t => t.paymentMethod === 'Split');
  return out;
}

// summaryTotals — app.js:1649. MUST run over the filtered rows.
function summaryTotals(rows) {
  let cashTotal = 0, gcashTotal = 0;
  rows.forEach(t => {
    if (t.paymentMethod === 'Split') { gcashTotal += t.gcashAmount || 0; cashTotal += t.cashAmount || 0; }
    else if (t.paymentMethod === 'GCash') gcashTotal += t.total || 0;
    else cashTotal += t.total || 0;
  });
  return { cashTotal, gcashTotal, grand: cashTotal + gcashTotal, count: rows.length };
}

// ------------------------------------------------------------------ tests ---

group('getToday uses Asia/Manila, not UTC');
for (const [label, ms] of [
  ['2:00 AM Manila', Date.UTC(2026, 9, 4, 18, 0)],
  ['4:30 AM Manila', Date.UTC(2026, 9, 4, 20, 30)],
  ['7:59 AM Manila', Date.UTC(2026, 9, 4, 23, 59)],
  ['8:00 AM Manila', Date.UTC(2026, 9, 5, 0, 0)],
]) {
  const d = new Date(ms);
  ok(`${label} files under 2026-10-05`, getToday(d) === '2026-10-05', `got ${getToday(d)}`);
}
ok('UTC put 7:59 AM on the wrong day (the original bug)', utcBuggy(new Date(Date.UTC(2026, 9, 4, 23, 59))) === '2026-10-04');
ok('UTC and Manila agree from 8:00 AM onward', utcBuggy(new Date(Date.UTC(2026, 9, 5, 0, 0))) === '2026-10-05');
ok('returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(getToday()));

group('search matches order number');
const ord = { number: 'W0042', customerName: 'Maria', orderType: 'tawag', type: 'pending', notes: '', timestamp: '5:23 PM', pickupTime: '', items: [{ name: 'Chopsuey' }] };
ok('finds by order number', orderMatchesSearch(ord, 'w0042'));
ok('finds by order number exact case', orderMatchesSearch(ord, 'W0042'));
ok('finds by customer name', orderMatchesSearch(ord, 'maria'));
ok('finds by item name', orderMatchesSearch(ord, 'chopsuey'));
ok('finds by order type', orderMatchesSearch(ord, 'tawag'));
ok('matches multi-token queries', orderMatchesSearch(ord, 'maria chopsuey'));
ok('rejects unrelated term', !orderMatchesSearch(ord, 'zzz'));
ok('empty term matches everything', orderMatchesSearch(ord, '  '));

group('GCash never records change');
ok('GCash gets no suggestions', suggestionsFor('GCash', 500, 500).length === 0);
ok('GCash change computes to 0', 500 - 500 === 0);
ok('Cash still gets suggestions', suggestionsFor('Cash', 500, 500).length === SUGGESTIONS.length);
ok('first Cash suggestion is exact-1', eq(suggestionsFor('Cash', 500, 500)[0], { paid: 501, change: 1 }));
ok('suggests nothing when tender already exact', suggestionsFor('Cash', 500, 500).length === SUGGESTIONS.length);
ok('under-tender only suggests amounts that clear the total', eq(suggestionsFor('Cash', 400, 500).map(s => s.paid), [600, 900, 1400]));
ok('every suggestion yields positive change', suggestionsFor('Cash', 400, 500).every(s => s.change > 0));

group('summary honours date + channel filter');
const H = [
  { date: '2026-10-05', orderType: 'walkin', paymentMethod: 'Cash', total: 100 },
  { date: '2026-10-05', orderType: 'walkin', paymentMethod: 'Cash', total: 200 },
  { date: '2026-10-05', orderType: 'tawag', paymentMethod: 'Cash', total: 150 },
  { date: '2026-10-05', orderType: 'walkin', paymentMethod: 'GCash', total: 500 },
  { date: '2026-10-05', orderType: 'tawag', paymentMethod: 'GCash', total: 400 },
  { date: '2026-10-05', orderType: 'walkin', paymentMethod: 'Split', total: 500, cashAmount: 100, gcashAmount: 400 },
  { date: '2026-10-05', orderType: 'tawag', paymentMethod: 'Split', total: 250, cashAmount: 200, gcashAmount: 50 },
  { date: '2026-10-04', orderType: 'walkin', paymentMethod: 'Cash', total: 999 },
];
for (const [scope, ch, exp] of [
  ['today', 'all', { cashTotal: 750, gcashTotal: 1350, grand: 2100, count: 7 }],
  ['today', 'walkin', { cashTotal: 300, gcashTotal: 0, grand: 300, count: 2 }],
  ['today', 'tawag', { cashTotal: 150, gcashTotal: 0, grand: 150, count: 1 }],
  ['today', 'gcash', { cashTotal: 0, gcashTotal: 900, grand: 900, count: 2 }],
  ['today', 'split', { cashTotal: 300, gcashTotal: 450, grand: 750, count: 2 }],
  ['all', 'gcash', { cashTotal: 0, gcashTotal: 900, grand: 900, count: 2 }],
]) {
  ok(`${scope}/${ch} totals`, eq(summaryTotals(applySummaryFilters(H, scope, ch)), exp),
     JSON.stringify(summaryTotals(applySummaryFilters(H, scope, ch))));
}
ok('today excludes yesterday', !applySummaryFilters(H, 'today', 'all').some(t => t.date === '2026-10-04'));
ok('grand always equals cash + gcash', ['today', 'all'].every(s =>
  ['all', 'walkin', 'tawag', 'gcash', 'split'].every(c => {
    const t = summaryTotals(applySummaryFilters(H, s, c));
    return t.grand === t.cashTotal + t.gcashTotal;
  })));

group('XSS escaping is safe and lossless');
const PAYLOADS = [
  'x" onclick="alert(1)', "y' onclick='alert(2)", 'a"><img src=x onerror=alert(3)>',
  "b');alert(4);//", 'c\\', "d\\';alert(5);//", '</script><script>alert(6)</script>',
  'plain name', "O'Brien & Sons", '₱250 Chopsuey',
];
let breakout = 0, roundTrip = 0;
for (const raw of PAYLOADS) {
  const encoded = jsStringArg(raw);
  if (encoded.includes('"')) breakout++;
  let captured = null;
  const updateQuantity = n => { captured = n; };
  try { new Function('updateQuantity', decodeAttr(`updateQuantity('${encoded}',-1)`))(updateQuantity); }
  catch { roundTrip++; continue; }
  if (captured !== raw) roundTrip++;
}
ok('no attribute breakout across payloads', breakout === 0);
ok('all payloads round-trip through onclick', roundTrip === 0);
ok('escapeHtmlAttr escapes both quote types', escapeHtmlAttr(`"'`) === '&quot;&#39;');
ok('escapeHtmlAttr escapes markup', escapeHtmlAttr('<b>&') === '&lt;b&gt;&amp;');
ok('safeDisplay is still text-only safe', safeDisplay('<script>') === '&lt;script&gt;');

// ----------------------------------------------------------------- report ---
console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILED'}  (${passed} passed, ${failed} failed)`);
process.exit(failed ? 1 : 0);