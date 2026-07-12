// Verifies the Firefox import workaround (Bugzilla #1292701: the popup closes
// as soon as a file picker opens, so imports must run from a regular tab):
//  - Firefox popup: Import opens popup.html?tab in a new tab and closes itself
//  - Firefox tab (?tab): Import uses the file input directly and works fully
//  - Chrome popup: Import uses the file input directly, as before

'use strict';

const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const { settle, createChromeMock } = require('./helpers');

const POPUP_HTML = `<body>
  <span id="annotationCount"></span>
  <div id="annotationsList"></div>
  <input id="searchInput">
  <button id="exportBtn"></button>
  <button id="importBtn"></button>
  <input type="file" id="importFile">
  <div id="storageBar"></div>
  <span id="storageText"></span>
  <p id="statusMessage" class="status-message" hidden></p>
</body>`;

const MODULES = ['../src/utils/util.js', '../src/utils/storage.js', '../src/popup/popup.js'];

let createdTabs = [];
let fileClicks = 0;
let popupClosed = false;

// Load the real popup page with fresh modules and globals per scenario
function loadPopup({ url, firefox }) {
  for (const m of MODULES) delete require.cache[require.resolve(m)];
  createdTabs = [];
  fileClicks = 0;
  popupClosed = false;

  const { chrome } = createChromeMock();
  const dom = new JSDOM(POPUP_HTML, { url });
  global.chrome = chrome;
  delete global.browser;
  if (firefox) {
    global.browser = {
      storage: chrome.storage,
      tabs: {
        create: async ({ url: tabUrl }) => {
          createdTabs.push(tabUrl);
        },
      },
    };
  }
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.alert = () => {
    throw new Error('alert() must not be used in the popup');
  };
  dom.window.close = () => {
    popupClosed = true;
  };

  require('../src/utils/util.js');
  global.OrangeElephantUtil = dom.window.OrangeElephantUtil;
  require('../src/utils/storage.js');
  global.OrangeElephantStorage = dom.window.OrangeElephantStorage;
  require('../src/popup/popup.js');

  document.getElementById('importFile').addEventListener('click', () => {
    fileClicks++;
  });
  return dom;
}

(async () => {
  // Scenario A: Firefox popup -> Import redirects to a tab, never opens the picker
  const popupUrl = 'moz-extension://test/src/popup/popup.html';
  loadPopup({ url: popupUrl, firefox: true });
  await settle();
  document.getElementById('importBtn').click();
  await settle();
  assert.deepStrictEqual(createdTabs, [`${popupUrl}?tab`], 'must open itself as a tab');
  assert.strictEqual(fileClicks, 0, 'file picker must not open in the Firefox popup');
  assert.strictEqual(popupClosed, true, 'popup closes after opening the tab');
  console.log('firefox popup redirects import to a tab: ok');

  // Scenario B: Firefox tab (?tab) -> Import opens the picker and works end to end
  loadPopup({ url: `${popupUrl}?tab`, firefox: true });
  await settle();
  document.getElementById('importBtn').click();
  await settle();
  assert.strictEqual(fileClicks, 1, 'file picker opens directly in the tab');
  assert.deepStrictEqual(createdTabs, [], 'no further tab is opened');
  assert.strictEqual(popupClosed, false);

  const importFile = document.getElementById('importFile');
  Object.defineProperty(importFile, 'files', {
    value: [{ text: async () => JSON.stringify({ annotations: { newguy: 'from tab import' } }) }],
    configurable: true,
  });
  importFile.dispatchEvent(new global.window.Event('change', { bubbles: true }));
  await settle();
  assert.deepStrictEqual(await global.OrangeElephantStorage.load(), { newguy: 'from tab import' });
  assert.strictEqual(
    document.getElementById('statusMessage').textContent,
    'Imported 1 annotations successfully!'
  );
  console.log('firefox tab imports end to end: ok');

  // Scenario C: Chrome popup -> unchanged direct import
  loadPopup({ url: 'chrome-extension://test/src/popup/popup.html', firefox: false });
  await settle();
  document.getElementById('importBtn').click();
  await settle();
  assert.strictEqual(fileClicks, 1, 'Chrome keeps the in-popup import');
  assert.deepStrictEqual(createdTabs, []);
  console.log('chrome popup imports directly: ok');

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
