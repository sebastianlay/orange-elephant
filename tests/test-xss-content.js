// Runs the real content script in jsdom and verifies the escaping fixes:
//  - annotations containing quotes render literally (no attribute breakout)
//  - a classic attribute-injection payload does not execute or inject attributes
//  - links with invalid usernames in the href are ignored entirely

'use strict';

const assert = require('node:assert');
const { settle, click, createChromeMock, loadExtension } = require('./helpers');

const { chrome } = createChromeMock();

const { dom, storage: S } = loadExtension({
  chrome,
  html: `<body>
    <span><a href="user?id=alice">alice</a></span>
    <span><a href="user?id=bob">bob</a></span>
    <span><a id="evil-link" href='user?id="onmouseover=alert(1)//'>evil</a></span>
  </body>`,
});

(async () => {
  // Seed storage directly, simulating legacy data that predates import validation
  const payload = '" autofocus onfocus="window.__pwned=1';
  await S.save({ alice: payload, bob: 'the "rust guy"' });

  require('../src/content/content.js');
  await settle();

  const aliceLink = document.querySelector('a[href="user?id=alice"]');
  const bobLink = document.querySelector('a[href="user?id=bob"]');

  // Badges render the raw text safely via textContent
  assert.strictEqual(aliceLink.nextElementSibling.textContent, payload);
  assert.strictEqual(bobLink.nextElementSibling.textContent, 'the "rust guy"');

  // Open the popup on the injection payload: value must be literal, nothing injected
  click(aliceLink);
  const popup = document.querySelector('.oe-popup');
  assert.ok(popup, 'popup should open');
  const input = popup.querySelector('.oe-popup-input');
  assert.strictEqual(input.value, payload, 'payload must appear literally in the input');
  assert.strictEqual(input.getAttribute('onfocus'), null, 'no injected onfocus attribute');
  assert.strictEqual(input.hasAttribute('autofocus'), false, 'no injected autofocus attribute');
  assert.strictEqual(popup.querySelector('[onfocus], [onmouseover], [onclick]'), null);
  assert.strictEqual(dom.window.__pwned, undefined, 'payload must not execute');
  assert.strictEqual(input.maxLength, 50);
  console.log('no attribute injection from annotation payload: ok');

  // Close and reopen on bob: a legitimate quote renders exactly
  popup.querySelector('.oe-popup-close').click();
  click(bobLink);
  assert.strictEqual(document.querySelector('.oe-popup-input').value, 'the "rust guy"');
  document.querySelector('.oe-popup-close').click();
  console.log('legitimate quotes render literally: ok');

  // The link with an invalid username must be left alone: no listeners, no popup
  click(document.getElementById('evil-link'));
  await settle(20);
  assert.strictEqual(document.querySelector('.oe-popup'), null, 'no popup for invalid username');
  console.log('invalid username in href is ignored: ok');

  // Whitespace normalization on save: type a messy annotation for bob
  click(bobLink);
  const input2 = document.querySelector('.oe-popup-input');
  input2.value = '  builds   great\tthings  ';
  document.querySelector('.oe-popup-save').click();
  await settle();
  assert.strictEqual(bobLink.nextElementSibling.textContent, 'builds great things');
  assert.strictEqual((await S.load()).bob, 'builds great things');
  console.log('normalizeAnnotation applied on save: ok');

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
