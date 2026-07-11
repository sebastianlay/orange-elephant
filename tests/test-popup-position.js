// Verifies popup positioning: clamps consistently in document coordinates,
// including on horizontally/vertically scrolled pages.

'use strict';

const assert = require('node:assert');
const { settle, click, createChromeMock, loadExtension } = require('./helpers');

const { chrome } = createChromeMock();

const { dom } = loadExtension({
  chrome,
  html: `<body><span><a href="user?id=alice">alice</a></span></body>`,
});

// Stub geometry: the popup measures 250x100, everything else returns the
// current scenario's anchor rect (viewport coordinates, like the real API)
const POPUP = { width: 250, height: 100 };
let anchorRect = { top: 0, bottom: 0, left: 0, right: 0 };
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  if (this.classList.contains('oe-popup')) {
    return { ...POPUP, top: 0, left: 0, right: POPUP.width, bottom: POPUP.height };
  }
  return {
    ...anchorRect,
    width: anchorRect.right - anchorRect.left,
    height: anchorRect.bottom - anchorRect.top,
  };
};

function setViewport({ scrollX, scrollY, innerWidth, innerHeight }) {
  for (const [key, value] of Object.entries({ scrollX, scrollY, innerWidth, innerHeight })) {
    Object.defineProperty(dom.window, key, { value, configurable: true });
    assert.strictEqual(dom.window[key], value, `override of ${key} must take effect`);
  }
}

(async () => {
  require('../src/content/content.js');
  await settle();

  const link = document.querySelector('a[href="user?id=alice"]');
  const openPopup = () => {
    click(link);
    const popup = document.querySelector('.oe-popup');
    assert.ok(popup, 'popup should open');
    return popup;
  };
  const closePopup = (popup) => popup.querySelector('.oe-popup-close').click();

  // 1. Plenty of room, no scroll: below the anchor, aligned to its left edge
  setViewport({ scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 768 });
  anchorRect = { top: 180, bottom: 200, left: 100, right: 150 };
  let popup = openPopup();
  assert.strictEqual(popup.style.top, '205px');
  assert.strictEqual(popup.style.left, '100px');
  closePopup(popup);
  console.log('base position: ok');

  // 2. Horizontally scrolled page, anchor near the viewport's right edge:
  //    the popup's right edge must stay 10px inside the *visible* right edge
  setViewport({ scrollX: 500, scrollY: 0, innerWidth: 800, innerHeight: 768 });
  anchorRect = { top: 180, bottom: 200, left: 700, right: 750 };
  popup = openPopup();
  // document coords: viewport right = 500 + 800 = 1300 -> left = 1300 - 250 - 10
  assert.strictEqual(popup.style.left, '1040px', 'clamped to visible right edge');
  assert.strictEqual(popup.style.top, '205px');
  closePopup(popup);
  console.log('right clamp under horizontal scroll: ok');

  // 3. Anchor partially left of the scrolled viewport: clamp to visible left edge
  anchorRect = { top: 180, bottom: 200, left: -20, right: 30 };
  popup = openPopup();
  // document coords: anchor left = 480 < scrollX + 10 = 510 -> clamp to 510
  assert.strictEqual(popup.style.left, '510px', 'clamped to visible left edge');
  closePopup(popup);
  console.log('left clamp under horizontal scroll: ok');

  // 4. Anchor near the bottom of a vertically scrolled viewport: flip above
  setViewport({ scrollX: 0, scrollY: 1000, innerWidth: 1024, innerHeight: 768 });
  anchorRect = { top: 730, bottom: 750, left: 100, right: 150 };
  popup = openPopup();
  // flip: 730 + 1000 - 100 - 5 = 1625 (below would be 1755 + 100 > 1768)
  assert.strictEqual(popup.style.top, '1625px', 'flipped above the anchor');
  assert.strictEqual(popup.style.left, '100px');
  closePopup(popup);
  console.log('vertical flip under scroll: ok');

  // 5. Tiny window where even flipping would go off-screen: pin to visible top
  setViewport({ scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 90 });
  anchorRect = { top: 10, bottom: 30, left: 100, right: 150 };
  popup = openPopup();
  // below: 35 + 100 > 90 -> flip target 10 - 100 - 5 = -95 -> pinned to scrollY + 5
  assert.strictEqual(popup.style.top, '5px', 'pinned to visible top');
  closePopup(popup);
  console.log('flip pinned inside tiny viewport: ok');

  console.log('ALL TESTS PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
