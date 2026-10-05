// Guards the invariant that makes tests/pos.test.js worth running: app.js must
// CALL js/pos-core.js, not keep a private copy of the same logic. If someone
// inlines arithmetic back into app.js, the other suite would silently stop
// covering the code that actually runs in the browser.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'pos-core.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'onlinePOS.html'), 'utf8');
const C = require(path.join(root, 'js', 'pos-core.js'));

// Strip comments so prose cannot trigger or satisfy these checks.
const appCode = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const coreCode = core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('app.js delegates shared logic instead of reimplementing it', () => {
  // A local wrapper is fine as long as its body defers to POSCore.
  const offenders = Object.keys(C).filter(name => {
    if (!new RegExp(`function ${name}\\s*\\(`).test(appCode)) return false;
    const body = appCode.match(new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n {4}\\}`));
    if (!body) return false;
    return !new RegExp(`POSCore\\.${name}\\b`).test(body[1]);
  });
  assert.deepStrictEqual(offenders, [], `app.js re-implements: ${offenders.join(', ')}`);
});

test('every POSCore call in app.js resolves to a real export', () => {
  const called = new Set([...app.matchAll(/POSCore\.(\w+)/g)].map(m => m[1]));
  const missing = [...called].filter(name => C[name] === undefined);
  assert.deepStrictEqual(missing, [], `unresolved: ${missing.join(', ')}`);
  assert.ok(called.size >= 20, `expected broad delegation, saw ${called.size}`);
});

test('pos-core.js stays free of browser and Firebase dependencies', () => {
  assert.ok(!/firebase|\bdatabase\s*\(|\.ref\s*\(|snapshot/i.test(coreCode));
  assert.ok(!/\bdocument\.|\bwindow\.|\.addEventListener/.test(coreCode));
});

test('pos-core.js loads in both Node and the browser', () => {
  assert.strictEqual(typeof C.getToday, 'function');
  assert.ok(/root\.POSCore\s*=/.test(core), 'must assign a browser global');
  assert.ok(/module\.exports/.test(core), 'must be requirable from Node');
});

test('pos-core.js is loaded before app.js', () => {
  const coreIdx = html.indexOf('js/pos-core.js');
  const appIdx = html.indexOf('src="app.js"');
  assert.ok(coreIdx !== -1, 'pos-core.js is not referenced by the page');
  assert.ok(coreIdx < appIdx, 'pos-core.js must load first');
});

test('all runtime files are present', () => {
  for (const f of ['index.html', 'onlinePOS.html', 'style.css', 'app.js', 'js/pos-core.js']) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
});

test('app.js is free of logic that now belongs in the core', () => {
  assert.ok(!/toString\(\)\.replace\(\/\\B/.test(appCode), 'inline currency formatting');
  assert.ok(!/toISOString\(\)\.split\('T'\)\[0\]/.test(appCode), 'UTC date key');
  assert.ok(!/fullyCompleted = \(!has/.test(appCode), 'duplicated completion logic');
  assert.ok(!/const (kitchenDone|pbqDone) =/.test(appCode), 'dead variables');
  assert.ok(!/reduce\(\(sum, i\) => sum \+ i\.total/.test(appCode), 'raw cart total');
  assert.ok(!/importantSuggestions/.test(appCode), 'duplicate suggestion list');
});