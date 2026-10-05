/**
 * pos-core.js - pure business logic for Celebrity Kitchen POS.
 *
 * Everything in here is side-effect free: no DOM, no Firebase, no globals.
 * That is what makes it testable in Node (see tests/).
 *
 * Loaded as a classic script in the browser (works over file://) and
 * require()'d in tests, via the dual export at the bottom.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.POSCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TIMEZONE = 'Asia/Manila';
  var ECO_BAG_PRICE = 5;
  var SUGGESTION_EXTRAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  // ------------------------------------------------------------ escaping ---

  // Mirrors the browser's textContent -> innerHTML serialisation for the
  // characters that can appear in this data. Notably does NOT escape quotes:
  // those are harmless in element text but must be escaped in attributes.
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\u00a0/g, '&nbsp;');
  }

  function escapeHtmlAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // For interpolating a value into a single-quoted JS string literal that is
  // itself inside an HTML attribute. Backslashes first, then quotes, then HTML.
  function jsStringArg(text) {
    return escapeHtmlAttr(String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  }

  // ------------------------------------------------------------- formatting ---

  function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getToday(now) {
    var d = now || new Date();
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
  }

  function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  // ------------------------------------------------------------ order shape ---

  function orderChannel(o) {
    return (o && (o.orderType || o.type)) || 'walkin';
  }

  function isPendingOrder(o) {
    return !!o && (o.type === 'pending' || o.paid === false);
  }

  function itemsHaveSection(o, section) {
    var items = (o && o.items) || [];
    if (section === 'kitchen') {
      return items.some(function (i) { return (i.category || 'Kitchen') !== 'PBQ'; });
    }
    return items.some(function (i) { return (i.category || 'Kitchen') === 'PBQ'; });
  }

  /**
   * Should this order appear on a station's board?
   *
   * Tawag is pay-at-pickup, so the kitchen must see it before payment is
   * collected - otherwise it cannot start cooking. Walk-in is paid at the
   * counter first, so it stays hidden until paid.
   */
  function stationVisible(o, section) {
    if (!o) return false;
    var done = section === 'kitchen' ? o.kitchenCompleted === true : o.pbqCompleted === true;
    var isTawag = orderChannel(o) === 'tawag';
    return itemsHaveSection(o, section) && !done && (o.paid !== false || isTawag);
  }

  /**
   * Once every station has finished, the order should leave the active queue
   * so the board stays clear.
   *
   * Never delete an UNPAID order: for a pending Tawag order the queue is the
   * only record of it, and history is only written at payment time. Deleting
   * it would lose the sale outright.
   */
  function shouldDeleteAfterCompletion(o, section) {
    if (!o) return false;
    var fullyCompleted;
    if (section === 'kitchen') {
      fullyCompleted = !itemsHaveSection(o, 'pbq') || o.pbqCompleted === true;
    } else if (section === 'pbq') {
      fullyCompleted = !itemsHaveSection(o, 'kitchen') || o.kitchenCompleted === true;
    } else {
      return false;
    }
    return fullyCompleted && o.paid !== false;
  }

  // ------------------------------------------------------------------- money ---

  function cartTotal(items, ecoBagCount) {
    var sum = (items || []).reduce(function (acc, i) {
      return acc + (i.total || 0);
    }, 0);
    return sum + ((ecoBagCount || 0) * ECO_BAG_PRICE);
  }

  function getCashRequired(state) {
    if (state.splitPayment) {
      return Math.max(0, state.currentTotal - state.gcashAmount);
    }
    return state.currentTotal;
  }

  /**
   * Why a payment cannot be submitted, or null if it can.
   * Returns a message rather than showing a toast, so it stays pure.
   */
  function canSubmitPayment(state) {
    var required = getCashRequired(state);
    if (state.splitPayment && state.gcashAmount === 0) {
      return 'Enter the GCash portion or use full Cash/GCash';
    }
    if (state.paidAmount < required) {
      return 'Cash paid less than cash required';
    }
    return null;
  }

  /**
   * "Pay X, get Y change" shortcuts shown after Calculate.
   * GCash is a QR transfer - there is nothing tendered and nothing to receive,
   * so it never gets suggestions.
   */
  function changeSuggestions(method, paidAmount, required) {
    if (method === 'GCash') return [];
    var out = [];
    for (var i = 0; i < SUGGESTION_EXTRAS.length; i++) {
      var paid = paidAmount + SUGGESTION_EXTRAS[i];
      var change = paid - required;
      if (change > 0) out.push({ paid: paid, change: change });
    }
    return out;
  }

  function applyDigit(value, digit) {
    return value * 10 + digit;
  }

  function backspaceDigit(value) {
    return Math.floor(value / 10);
  }

  // GCash is capped at the order total; cash tendered may exceed it.
  function addCapped(value, amount, cap) {
    return Math.min(cap, value + amount);
  }

  function generateOrderNumber(counter) {
    return 'W' + String(counter).padStart(4, '0');
  }

  // ------------------------------------------------------------------ search ---

  function orderMatchesSearch(o, rawTerm) {
    var term = String(rawTerm || '').toLowerCase().trim();
    if (!term) return true;
    var tokens = term.split(/\s+/).filter(Boolean);
    var haystack = [
      o.number || '',
      o.customerName || '',
      orderChannel(o) === 'tawag' ? 'tawag' : 'walkin',
      o.type === 'pending' ? 'pending' : '',
      o.notes || '',
      o.timestamp || '',
      o.pickupTime || '',
      (o.items || []).map(function (i) { return i.name || ''; }).join(' ')
    ].join(' ').toLowerCase();
    return tokens.every(function (t) { return haystack.indexOf(t) !== -1; });
  }

  function menuItemMatchesSearch(item, rawTerm) {
    var term = String(rawTerm || '').toLowerCase().trim();
    if (!term) return true;
    var tokens = term.split(/\s+/).filter(Boolean);
    var haystack = ((item.name || '') + ' ' + (item.category || '') + ' ' + (item.price || '')).toLowerCase();
    return tokens.every(function (t) { return haystack.indexOf(t) !== -1; });
  }

  function highlightMatch(text, rawTerm) {
    var raw = String(text || '');
    var term = String(rawTerm || '');
    if (!term || !raw) return escapeHtml(raw);
    var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var parts = raw.split(new RegExp('(' + escaped + ')', 'ig'));
    return parts.map(function (part, i) {
      return i % 2 === 1 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part);
    }).join('');
  }

  function orderMatchesTypeFilter(o, type) {
    if (!type || type === 'all') return true;
    return orderChannel(o) === type;
  }

  // ---------------------------------------------------------------- reporting ---

  function pendingTotals(rows) {
    var walkinTotal = 0, tawagTotal = 0, walkinCount = 0, tawagCount = 0, grandTotal = 0;
    (rows || []).forEach(function (o) {
      var t = o.total || 0;
      grandTotal += t;
      if (orderChannel(o) === 'tawag') { tawagTotal += t; tawagCount++; }
      else { walkinTotal += t; walkinCount++; }
    });
    return {
      grandTotal: grandTotal, walkinTotal: walkinTotal, tawagTotal: tawagTotal,
      walkinCount: walkinCount, tawagCount: tawagCount, count: (rows || []).length
    };
  }

  /**
   * Cash drawer vs GCash wallet, plus the grand total.
   *
   * Split payments count only their actual components, so the drawer reflects
   * money that really moved. GCash counts as the order total because that is
   * what was transferred.
   */
  function summaryTotals(rows) {
    var cashTotal = 0, gcashTotal = 0, splitCount = 0, splitCash = 0, splitGcash = 0;
    (rows || []).forEach(function (t) {
      if (t.paymentMethod === 'Split') {
        splitCount++;
        splitCash += t.cashAmount || 0;
        splitGcash += t.gcashAmount || 0;
        gcashTotal += t.gcashAmount || 0;
        cashTotal += t.cashAmount || 0;
      } else if (t.paymentMethod === 'GCash') {
        gcashTotal += t.total || 0;
      } else {
        cashTotal += t.total || 0;
      }
    });
    return {
      cashTotal: cashTotal, gcashTotal: gcashTotal, grand: cashTotal + gcashTotal,
      count: (rows || []).length, splitCount: splitCount,
      splitCash: splitCash, splitGcash: splitGcash
    };
  }

  function itemSalesBreakdown(rows) {
    var sales = {}, ecoBagQty = 0, ecoBagTotal = 0;
    (rows || []).forEach(function (t) {
      (t.items || []).forEach(function (i) {
        if (!sales[i.name]) sales[i.name] = { qty: 0, total: 0 };
        sales[i.name].qty += i.quantity || 0;
        sales[i.name].total += i.total || 0;
      });
      if (t.ecoBags > 0) {
        ecoBagQty += t.ecoBags;
        ecoBagTotal += t.ecoBags * ECO_BAG_PRICE;
        if (!sales['Eco Bag']) sales['Eco Bag'] = { qty: 0, total: 0 };
        sales['Eco Bag'].qty += t.ecoBags;
        sales['Eco Bag'].total += t.ecoBags * ECO_BAG_PRICE;
      }
    });
    return { sales: sales, ecoBagQty: ecoBagQty, ecoBagTotal: ecoBagTotal };
  }

  // ----------------------------------------------------------------- filters ---

  /**
   * Shared by the Summary screen and the CSV export so they can never
   * disagree about which rows are in scope.
   *
   * dateScope: 'today' | 'all'
   * channel:   'all' | 'walkin' | 'tawag' | 'gcash' | 'split'
   */
  function applySummaryFilters(rows, dateScope, channel, today) {
    var out = rows || [];
    if (dateScope === 'today') {
      var day = today || getToday();
      out = out.filter(function (t) { return t.date === day; });
    }
    if (channel === 'walkin') {
      out = out.filter(function (t) { return orderChannel(t) === 'walkin' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split'; });
    } else if (channel === 'tawag') {
      out = out.filter(function (t) { return orderChannel(t) === 'tawag' && t.paymentMethod !== 'GCash' && t.paymentMethod !== 'Split'; });
    } else if (channel === 'gcash') {
      out = out.filter(function (t) { return t.paymentMethod === 'GCash'; });
    } else if (channel === 'split') {
      out = out.filter(function (t) { return t.paymentMethod === 'Split'; });
    }
    return out;
  }

  // --------------------------------------------------------------------- CSV ---

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function itemsSummary(items) {
    return (items || []).map(function (i) { return i.name + '×' + i.quantity; }).join('; ');
  }

  var SALES_HEADER = [
    'Time', 'Date', 'Order#', 'Type', 'Customer', 'Items', 'EcoBags', 'Total',
    'Payment', 'CashTendered', 'GCash', 'Change', 'Status'
  ].join(',');

  function toRow(values) {
    return values.map(csvCell).join(',');
  }

  /**
   * End-of-day export rows.
   *
   * PAID sales come from transaction history, NOT from the live order queue:
   * completing an order deletes it from the queue, so exporting the queue
   * silently loses every finished sale.
   *
   * Orders still awaiting payment are included too, so clearing the queue
   * never quietly discards an uncollected Tawag order.
   */
  function selectEndOfDayRows(historyData, orderData, today) {
    var sold = historyData
      ? Object.keys(historyData).map(function (k) {
          var t = Object.assign({}, historyData[k]);
          t.id = k;
          return t;
        }).filter(function (t) { return t.date === today; })
      : [];
    var open = orderData
      ? Object.keys(orderData).map(function (k) {
          var o = Object.assign({}, orderData[k]);
          o.id = k;
          return o;
        }).filter(function (o) { return o.date !== today || o.paid === false; })
      : [];
    return { sold: sold, open: open };
  }

  function buildSalesCsv(sold, open, today) {
    var lines = [];
    (sold || []).forEach(function (t) {
      lines.push(toRow([
        t.timestamp || '', t.date || today, t.number || '', orderChannel(t),
        t.customerName || '', itemsSummary(t.items), t.ecoBags || 0,
        t.total || 0, t.paymentMethod || 'Cash',
        t.paymentMethod === 'Split' ? (t.cashAmount || 0) : (t.paid || 0),
        t.gcashAmount || 0, t.change || 0, 'PAID'
      ]));
    });
    (open || []).forEach(function (o) {
      lines.push(toRow([
        o.timestamp || '', today, o.number || '', orderChannel(o),
        o.customerName || '', itemsSummary(o.items), o.ecoBags || 0,
        o.total || 0, o.paymentMethod || 'pending', '', '', '', 'UNPAID'
      ]));
    });
    return SALES_HEADER + '\n' + (lines.length ? lines.join('\n') + '\n' : '');
  }

  return {
    TIMEZONE: TIMEZONE,
    ECO_BAG_PRICE: ECO_BAG_PRICE,
    SUGGESTION_EXTRAS: SUGGESTION_EXTRAS,
    SALES_HEADER: SALES_HEADER,

    escapeHtml: escapeHtml,
    escapeHtmlAttr: escapeHtmlAttr,
    jsStringArg: jsStringArg,
    formatNumber: formatNumber,
    getToday: getToday,
    isIsoDate: isIsoDate,

    orderChannel: orderChannel,
    isPendingOrder: isPendingOrder,
    itemsHaveSection: itemsHaveSection,
    stationVisible: stationVisible,
    shouldDeleteAfterCompletion: shouldDeleteAfterCompletion,

    cartTotal: cartTotal,
    getCashRequired: getCashRequired,
    canSubmitPayment: canSubmitPayment,
    changeSuggestions: changeSuggestions,
    applyDigit: applyDigit,
    backspaceDigit: backspaceDigit,
    addCapped: addCapped,
    generateOrderNumber: generateOrderNumber,

    orderMatchesSearch: orderMatchesSearch,
    menuItemMatchesSearch: menuItemMatchesSearch,
    highlightMatch: highlightMatch,
    orderMatchesTypeFilter: orderMatchesTypeFilter,

    pendingTotals: pendingTotals,
    summaryTotals: summaryTotals,
    itemSalesBreakdown: itemSalesBreakdown,
    applySummaryFilters: applySummaryFilters,

    csvCell: csvCell,
    itemsSummary: itemsSummary,
    selectEndOfDayRows: selectEndOfDayRows,
    buildSalesCsv: buildSalesCsv
  };
});