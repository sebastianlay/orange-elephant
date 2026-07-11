// Runs the real content script in jsdom with a chrome.storage.sync mock
// that fires onChanged like a real browser. Verifies:
//  - two annotated users sharing a parent element both keep their badge
//  - no duplicate click/keydown listeners after storage changes and saves
//  - the full edit and delete flows through the popup

'use strict';

const assert = require('node:assert');
const { settle, click, createChromeMock, loadExtension } = require('./helpers');

const { chrome } = createChromeMock({ fireEvents: true });

const { dom, storage: S } = loadExtension({
  chrome,
  html: `<body>
    <span class="comhead">
      <a href="user?id=alice">alice</a> |
      <a href="user?id=bob">bob</a>
    </span>
    <span class="subline"><a href="user?id=carol">carol</a></span>
    <span class="subline"><a href="user?id=dave">dave</a></span>
  </body>`,
});

// Count addEventListener calls per (element, type) to detect duplicates
const listenerCounts = new Map();
const origAdd = dom.window.EventTarget.prototype.addEventListener;
dom.window.EventTarget.prototype.addEventListener = function (type, ...rest) {
  const key = { target: this, type };
  let found = false;
  for (const [k] of listenerCounts) {
    if (k.target === this && k.type === type) {
      listenerCounts.set(k, listenerCounts.get(k) + 1);
      found = true;
    }
  }
  if (!found) listenerCounts.set(key, 1);
  return origAdd.call(this, type, ...rest);
};
const countFor = (el, type) => {
  for (const [k, v] of listenerCounts) if (k.target === el && k.type === type) return v;
  return 0;
};

(async () => {
  await S.save({ alice: 'nice person', bob: 'the builder' });
  await settle();

  require('../src/content/content.js');
  await settle();

  const [aliceLink, bobLink, carolLink] = ['alice', 'bob', 'carol'].map((u) =>
    document.querySelector(`a[href="user?id=${u}"]`)
  );

  // Both badges must exist, each as its link's next sibling
  assert.strictEqual(document.querySelectorAll('.oe-badge').length, 2);
  assert.strictEqual(aliceLink.nextElementSibling.className, 'oe-badge');
  assert.strictEqual(aliceLink.nextElementSibling.textContent, 'nice person');
  assert.strictEqual(bobLink.nextElementSibling.className, 'oe-badge');
  assert.strictEqual(bobLink.nextElementSibling.textContent, 'the builder');
  console.log('both badges in shared parent: ok');

  assert.strictEqual(countFor(aliceLink, 'click'), 1);
  assert.strictEqual(countFor(aliceLink, 'keydown'), 1);

  // Simulate a change coming from another device (chunk-only change: same chunkCount)
  await S.save({ alice: 'nice person', bob: 'the builder', carol: 'newly synced' });
  await settle();
  assert.strictEqual(carolLink.nextElementSibling.textContent, 'newly synced');
  assert.strictEqual(document.querySelectorAll('.oe-badge').length, 3);

  // Still exactly one listener per link after the storage-change reload
  assert.strictEqual(countFor(aliceLink, 'click'), 1);
  assert.strictEqual(countFor(aliceLink, 'keydown'), 1);
  assert.strictEqual(countFor(carolLink, 'click'), 1);
  console.log('no duplicate listeners after remote change: ok');

  // Full UI edit flow: click alice -> popup -> edit -> save
  click(aliceLink);
  const popup = document.querySelector('.oe-popup');
  assert.ok(popup, 'popup should open');
  const input = popup.querySelector('.oe-popup-input');
  assert.strictEqual(input.value, 'nice person');
  input.value = 'absolute legend';
  popup.querySelector('.oe-popup-save').click();
  await settle();

  assert.strictEqual(document.querySelector('.oe-popup'), null, 'popup should close');
  assert.strictEqual(aliceLink.nextElementSibling.textContent, 'absolute legend');
  assert.strictEqual(bobLink.nextElementSibling.textContent, 'the builder');
  assert.deepStrictEqual(await S.load(), {
    alice: 'absolute legend',
    bob: 'the builder',
    carol: 'newly synced',
  });

  // The save fired onChanged in this context too -> still no duplicates
  assert.strictEqual(countFor(aliceLink, 'click'), 1);
  assert.strictEqual(countFor(aliceLink, 'keydown'), 1);
  assert.strictEqual(countFor(bobLink, 'click'), 1);
  console.log('no duplicate listeners after local save + onChanged: ok');

  // Delete flow via badge: click bob's badge -> delete
  click(bobLink.nextElementSibling);
  const delBtn = document.querySelector('.oe-popup .oe-popup-delete');
  assert.ok(delBtn, 'delete button should exist for annotated user');
  delBtn.click();
  await settle();
  assert.strictEqual(bobLink.nextElementSibling?.classList.contains('oe-badge') || false, false);
  assert.strictEqual(document.querySelectorAll('.oe-badge').length, 2);
  assert.deepStrictEqual(await S.load(), { alice: 'absolute legend', carol: 'newly synced' });
  console.log('delete via badge: ok');

  // No badge duplication anywhere after all the refresh cycles
  const badges = [...document.querySelectorAll('.oe-badge')].map((b) => b.dataset.username);
  assert.deepStrictEqual(badges.sort(), ['alice', 'carol']);

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
