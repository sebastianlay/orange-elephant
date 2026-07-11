// Shared test helpers: a chrome.storage.sync mock and jsdom setup for
// loading the real extension scripts outside a browser.

'use strict';

const { JSDOM } = require('jsdom');

// Wait for pending promises, timers and storage events to finish
const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

// Dispatch a bubbling click like a real user interaction
const click = (el) =>
  el.dispatchEvent(
    new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true })
  );

// Mock of chrome.storage.sync backed by a plain object.
// - `backing` can be inspected and manipulated directly to simulate sync states.
// - `state.failSaves` makes set() throw, simulating an exceeded quota.
// - With `fireEvents: true`, onChanged listeners fire asynchronously and only
//   for keys whose value actually changed, like in a real browser.
function createChromeMock({ fireEvents = false } = {}) {
  const backing = {};
  const listeners = [];
  const state = { failSaves: false };

  function fireChanges(changes) {
    if (!fireEvents || Object.keys(changes).length === 0) return;
    setTimeout(() => listeners.forEach((listener) => listener(changes, 'sync')), 0);
  }

  const chrome = {
    storage: {
      sync: {
        async get(keys) {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of arr) if (k in backing) out[k] = structuredClone(backing[k]);
          return out;
        },
        async set(obj) {
          if (state.failSaves) throw new Error('QUOTA_BYTES quota exceeded');
          const changes = {};
          for (const [k, v] of Object.entries(obj)) {
            if (JSON.stringify(backing[k]) !== JSON.stringify(v)) {
              changes[k] = { oldValue: backing[k], newValue: structuredClone(v) };
              backing[k] = structuredClone(v);
            }
          }
          fireChanges(changes);
        },
        async remove(keys) {
          const changes = {};
          for (const k of [].concat(keys)) {
            if (k in backing) {
              changes[k] = { oldValue: backing[k] };
              delete backing[k];
            }
          }
          fireChanges(changes);
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
      },
    },
  };

  return { chrome, backing, state, listeners };
}

// Create a jsdom window with the extension globals and load util.js and
// storage.js. The content/popup script is required by the test itself,
// so that storage can be seeded first.
function loadExtension({ html, url = 'https://news.ycombinator.com/item?id=1', chrome }) {
  const dom = new JSDOM(html, { url });
  global.chrome = chrome;
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.MutationObserver = dom.window.MutationObserver;

  require('../src/utils/util.js');
  global.OrangeElephantUtil = dom.window.OrangeElephantUtil;
  require('../src/utils/storage.js');
  global.OrangeElephantStorage = dom.window.OrangeElephantStorage;

  return { dom, storage: dom.window.OrangeElephantStorage, util: dom.window.OrangeElephantUtil };
}

module.exports = { settle, click, createChromeMock, loadExtension };
