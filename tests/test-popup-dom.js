// Runs the real popup script in jsdom and verifies:
//  - a legacy username containing quotes cannot inject attributes into the list
//  - import sanitizes entries, reports skipped ones, rejects non-object formats
//  - failed deletes roll back and report via the inline status (never alert())

'use strict';

const assert = require('node:assert');
const { settle, createChromeMock, loadExtension } = require('./helpers');

const { chrome, state } = createChromeMock();

const { storage: S } = loadExtension({
  chrome,
  url: 'chrome-extension://test/src/popup/popup.html',
  html: `<body>
    <span id="annotationCount"></span>
    <div id="annotationsList"></div>
    <input id="searchInput">
    <button id="exportBtn"></button>
    <button id="importBtn"></button>
    <input type="file" id="importFile">
    <div id="storageBar"></div>
    <span id="storageText"></span>
    <p id="statusMessage" class="status-message" hidden></p>
  </body>`,
});

// popup.js must not use alert() at all (invisible in Firefox popups)
global.alert = () => {
  throw new Error('alert() must not be used in the popup');
};

(async () => {
  // Legacy data with a hostile username, stored before validation existed
  const evilName = 'x" onmouseover="window.__pwned=1';
  await S.save({ [evilName]: 'legacy entry', alice: 'fine' });

  require('../src/popup/popup.js');
  await settle();

  const listEl = document.getElementById('annotationsList');
  const statusEl = document.getElementById('statusMessage');

  // Username with quotes must round-trip through the data attribute unharmed
  const items = [...listEl.querySelectorAll('.annotation-item')];
  assert.strictEqual(items.length, 2);
  const evilItem = items.find((i) => i.dataset.username === evilName);
  assert.ok(evilItem, 'hostile username must round-trip exactly through data-username');
  assert.strictEqual(document.querySelector('[onmouseover]'), null, 'no injected attributes');
  assert.strictEqual(global.window.__pwned, undefined);
  console.log('popup list attribute escaping: ok');

  // Delete works even for the hostile name (dataset round-trip)
  evilItem.querySelector('.annotation-delete').click();
  await settle();
  assert.deepStrictEqual(await S.load(), { alice: 'fine' });
  console.log('delete with hostile username: ok');

  // Import a mixed file -> valid entries kept, invalid skipped, user told
  const importFile = document.getElementById('importFile');
  const importPayload = JSON.stringify({
    annotations: {
      newguy: 'from import',
      'bad name': 'nope',
      toolong: 'y'.repeat(80),
      broken: 123,
    },
  });
  Object.defineProperty(importFile, 'files', {
    value: [{ text: async () => importPayload }],
    configurable: true,
  });
  importFile.dispatchEvent(new global.window.Event('change', { bubbles: true }));
  await settle();

  assert.deepStrictEqual(await S.load(), {
    alice: 'fine',
    newguy: 'from import',
    toolong: 'y'.repeat(50),
  });
  assert.strictEqual(statusEl.hidden, false, 'status must be visible');
  assert.strictEqual(
    statusEl.textContent,
    'Imported 2 annotations successfully! Skipped 2 invalid entries.'
  );
  assert.strictEqual(statusEl.classList.contains('error'), false);
  console.log('import reports via inline status: ok');

  // An array (or any non-object) is rejected as invalid format
  Object.defineProperty(importFile, 'files', {
    value: [{ text: async () => JSON.stringify({ annotations: ['a', 'b'] }) }],
    configurable: true,
  });
  importFile.dispatchEvent(new global.window.Event('change', { bubbles: true }));
  await settle();
  assert.strictEqual(statusEl.textContent, 'Invalid file format. Expected JSON with "annotations" object.');
  assert.strictEqual(statusEl.classList.contains('error'), true, 'format error styled as error');
  assert.deepStrictEqual(Object.keys(await S.load()).sort(), ['alice', 'newguy', 'toolong']);
  console.log('array import rejected: ok');

  // A failing delete rolls back and reports instead of failing silently
  state.failSaves = true;
  const aliceItem = [...listEl.querySelectorAll('.annotation-item')].find(
    (i) => i.dataset.username === 'alice'
  );
  aliceItem.querySelector('.annotation-delete').click();
  await settle();
  assert.strictEqual(statusEl.textContent, 'Failed to delete: QUOTA_BYTES quota exceeded');
  assert.strictEqual(statusEl.classList.contains('error'), true);
  assert.deepStrictEqual(Object.keys(await S.load()).sort(), ['alice', 'newguy', 'toolong']);
  assert.ok(
    [...listEl.querySelectorAll('.annotation-item')].some((i) => i.dataset.username === 'alice'),
    'alice must still be listed after the failed delete'
  );

  // ... and succeeds normally once storage works again (in-memory state intact)
  state.failSaves = false;
  aliceItem.querySelector('.annotation-delete').click();
  await settle();
  assert.deepStrictEqual(Object.keys(await S.load()).sort(), ['newguy', 'toolong']);
  console.log('failed popup delete rolls back and reports: ok');

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
