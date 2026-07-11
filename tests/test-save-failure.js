// Verifies that a failed save in the content script keeps the popup open,
// shows an inline error, and rolls back the in-memory change.

'use strict';

const assert = require('node:assert');
const { settle, click, createChromeMock, loadExtension } = require('./helpers');

const { chrome, state } = createChromeMock();

const { storage: S } = loadExtension({
  chrome,
  html: `<body><span><a href="user?id=alice">alice</a></span></body>`,
});

(async () => {
  await S.save({ alice: 'nice person' });

  require('../src/content/content.js');
  await settle();

  const aliceLink = document.querySelector('a[href="user?id=alice"]');

  // Edit with failing storage: popup stays open with an inline error
  state.failSaves = true;
  click(aliceLink);
  let input = document.querySelector('.oe-popup-input');
  input.value = 'new text';
  document.querySelector('.oe-popup-save').click();
  await settle();

  const popup = document.querySelector('.oe-popup');
  assert.ok(popup, 'popup must stay open after a failed save');
  const error = popup.querySelector('.oe-popup-error');
  assert.ok(error, 'error message must be shown');
  assert.strictEqual(error.textContent, 'Could not save: QUOTA_BYTES quota exceeded');
  assert.strictEqual(error.getAttribute('role'), 'alert');
  assert.strictEqual(input.value, 'new text', 'typed text is kept for retrying');
  assert.strictEqual(aliceLink.nextElementSibling.textContent, 'nice person', 'badge unchanged');
  assert.deepStrictEqual(await S.load(), { alice: 'nice person' }, 'storage unchanged');
  console.log('failed save keeps popup open with error: ok');

  // A second failing attempt reuses the same error element
  document.querySelector('.oe-popup-save').click();
  await settle();
  assert.strictEqual(popup.querySelectorAll('.oe-popup-error').length, 1);

  // In-memory state was rolled back: closing and reopening shows the old value
  popup.querySelector('.oe-popup-close').click();
  click(aliceLink);
  input = document.querySelector('.oe-popup-input');
  assert.strictEqual(input.value, 'nice person', 'in-memory annotation was rolled back');
  console.log('in-memory rollback: ok');

  // Storage recovers: the same edit now saves, closes the popup, updates the badge
  state.failSaves = false;
  input.value = 'new text';
  document.querySelector('.oe-popup-save').click();
  await settle();
  assert.strictEqual(document.querySelector('.oe-popup'), null, 'popup closes on success');
  assert.strictEqual(aliceLink.nextElementSibling.textContent, 'new text');
  assert.deepStrictEqual(await S.load(), { alice: 'new text' });
  console.log('retry after recovery succeeds: ok');

  // Delete with failing storage: same protection via saveAnnotation(username, '')
  state.failSaves = true;
  click(aliceLink.nextElementSibling);
  document.querySelector('.oe-popup-delete').click();
  await settle();
  assert.ok(document.querySelector('.oe-popup'), 'popup must stay open after failed delete');
  assert.strictEqual(
    document.querySelector('.oe-popup-error').textContent,
    'Could not save: QUOTA_BYTES quota exceeded'
  );
  assert.strictEqual(aliceLink.nextElementSibling.textContent, 'new text', 'badge unchanged');
  assert.deepStrictEqual(await S.load(), { alice: 'new text' });

  state.failSaves = false;
  document.querySelector('.oe-popup-delete').click();
  await settle();
  assert.strictEqual(document.querySelector('.oe-popup'), null);
  assert.ok(!aliceLink.nextElementSibling?.classList?.contains('oe-badge'), 'badge removed');
  assert.deepStrictEqual(await S.load(), {});
  console.log('failed delete rolls back, retry succeeds: ok');

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
