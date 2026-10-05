// Guards the accessibility work. These read the real shipped files, so if
// someone reverts an element to a <div>, adds a zoom-blocking viewport, or
// drops an aria-label, the suite fails instead of the problem coming back.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'onlinePOS.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const both = html + '\n' + appJs;

// Elements that handle clicks but are not natively interactive. Screen readers
// announce these as plain text and Tab skips them.
const NON_INTERACTIVE = /<(div|span|li|td|i)\b[^>]*\bonclick\b/gi;

test('no clickable non-interactive elements remain', () => {
  const hits = both.match(NON_INTERACTIVE) ?? [];
  assert.deepStrictEqual(hits, [], `found ${hits.length}: ${hits.join(', ')}`);
});

test('pinch-zoom is not disabled', () => {
  const viewport = html.match(/<meta[^>]+name="viewport"[^>]*>/i);
  assert.ok(viewport, 'viewport meta tag missing');
  assert.ok(!/user-scalable\s*=\s*no/i.test(viewport[0]), 'user-scalable=no blocks zoom');
  assert.ok(!/maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport[0]), 'maximum-scale=1 blocks zoom');
});

test('every button is explicitly type="button"', () => {
  // A button with no type inside a form defaults to submit and reloads the page.
  const untyped = [...both.matchAll(/<button\b([^>]*)>/gi)]
    .filter(m => !/\btype\s*=/.test(m[1]))
    .map(m => m[0].slice(0, 60));
  assert.deepStrictEqual(untyped, []);
});

test('buttons reset UA chrome so the layout does not shift', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  // A <button> with a UA border/background renders differently to a <div>.
  // Check every rule for the class, since some are spread across the file.
  for (const cls of ['.more-option', '.quick-amount', '.close-modal', '.suggestion-item', '.btn-food']) {
    const blocks = [...css.matchAll(new RegExp(`\\${cls}\\s*\\{[\\s\\S]*?\\n\\s{4}\\}`, 'g'))].map(m => m[0]);
    assert.ok(blocks.length, `${cls} has no rule in style.css`);
    assert.ok(blocks.some(b => /border\s*:\s*none/.test(b)), `${cls} needs border: none`);
    assert.ok(
      blocks.some(b => /font-family\s*:|font\s*:\s*inherit/.test(b)),
      `${cls} needs a font reset`
    );
  }
});

test('icon-only buttons carry an accessible name', () => {
  // A button whose only content is a glyph still needs an aria-label.
  const iconOnly = [...both.matchAll(/<button\b([^>]*)>([\s\S]{0,40}?)<\/button>/gi)]
    .filter(([, attrs, body]) => {
      const text = body.replace(/<[^>]*>/g, '').replace(/[₱+\-×&;]/g, '').trim();
      return text.length < 2 && !/aria-label/.test(attrs);
    })
    .map(m => m[0].slice(0, 70));
  assert.deepStrictEqual(iconOnly, []);
});

test('form fields are labelled', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  const unlabelled = ids.filter(id => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${escaped}"`));
    if (!tag) return false;
    if (/type\s*=\s*"hidden"/.test(tag[0])) return false;
    if (/aria-label/.test(tag[0])) return false;
    return !html.includes(`for="${id}"`);
  });
  assert.deepStrictEqual(unlabelled, []);
});

test('the theme and sound toggles expose switch state', () => {
  for (const label of ['Dark Mode', 'Sound']) {
    const btn = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
    assert.ok(btn, `${label} button missing`);
    assert.ok(/role="switch"/.test(btn[0]), `${label} needs role="switch"`);
    assert.ok(/aria-checked="(true|false)"/.test(btn[0]), `${label} needs aria-checked`);
  }
  // app.js must keep aria-checked in sync with the real toggle.
  assert.ok(/theme-switch[\s\S]{0,200}aria-checked/.test(appJs), 'toggleTheme does not update aria-checked');
  assert.ok(/sound-switch[\s\S]{0,200}aria-checked/.test(appJs), 'toggleSound does not update aria-checked');
});

test('a focus ring is defined for keyboard users', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.ok(/:focus-visible/.test(css), 'no :focus-visible styling, keyboard focus is invisible');
  assert.ok(/\.sr-only\s*\{/.test(css), 'the visually-hidden label helper is missing');
});