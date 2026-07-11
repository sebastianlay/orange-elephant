// Exercises src/utils/storage.js with a mocked chrome.storage.sync

'use strict';

const assert = require('node:assert');
const { createChromeMock } = require('./helpers');

const { chrome, backing } = createChromeMock();
global.chrome = chrome;
global.window = {};
require('../src/utils/storage.js');
const S = global.window.OrangeElephantStorage;

(async () => {
  // 1. Empty storage loads as {} and does not block saving
  assert.deepStrictEqual(await S.load(), {});

  // 2. Round-trip
  await S.save({ alice: 'nice person', bob: 'the "rust guy"' });
  assert.deepStrictEqual(await S.load(), { alice: 'nice person', bob: 'the "rust guy"' });
  console.log('round-trip: ok');

  // 3. Partial sync: meta present but chunk missing -> load must throw
  const savedChunk = backing['oe_chunk_0'];
  delete backing['oe_chunk_0'];
  await assert.rejects(S.load(), /Missing chunk 0/);
  console.log('load with missing chunk throws: ok');

  // 4. Save after failed load must be refused (this was the data-wipe path)
  await assert.rejects(S.save({ mallory: 'only entry' }), /Saving is disabled/);
  assert.strictEqual(backing['oe_meta'].chunkCount, 1, 'storage must be untouched');
  console.log('save refused after failed load: ok');

  // 5. Chunk finishes syncing -> load succeeds again -> saving re-enabled
  backing['oe_chunk_0'] = savedChunk;
  assert.deepStrictEqual(await S.load(), { alice: 'nice person', bob: 'the "rust guy"' });
  await S.save({ alice: 'nice person' });
  assert.deepStrictEqual(await S.load(), { alice: 'nice person' });
  console.log('recovery after successful reload: ok');

  // 6. hasAnnotationChanges matches our keys and nothing else
  assert.strictEqual(S.hasAnnotationChanges({ oe_meta: {} }), true);
  assert.strictEqual(S.hasAnnotationChanges({ oe_chunk_0: {} }), true);
  assert.strictEqual(S.hasAnnotationChanges({ oe_chunk_12: {} }), true);
  assert.strictEqual(S.hasAnnotationChanges({ annotations: {} }), false);
  assert.strictEqual(S.hasAnnotationChanges({}), false);
  console.log('hasAnnotationChanges: ok');

  // 7. getStats: no getBytesInUse available -> falls back to estimate, never NaN
  const stats1 = await S.getStats();
  assert.strictEqual(stats1.bytesUsed, 8000, 'estimate = 1 chunk * 8000');
  assert.strictEqual(stats1.percentUsed, 8);
  assert.strictEqual(stats1.chunksUsed, 1);

  // 8. getStats: promise API returning a number is used directly
  chrome.storage.sync.getBytesInUse = async () => 51200;
  const stats2 = await S.getStats();
  assert.strictEqual(stats2.bytesUsed, 51200);
  assert.strictEqual(stats2.percentUsed, 50);

  // 9. getStats: undefined result (callback-style quirk) must not produce NaN
  chrome.storage.sync.getBytesInUse = async () => undefined;
  const stats3 = await S.getStats();
  assert.strictEqual(stats3.bytesUsed, 8000);
  assert.ok(!Number.isNaN(stats3.percentUsed));

  // 10. percentUsed is clamped to 100
  chrome.storage.sync.getBytesInUse = async () => 200000;
  const stats4 = await S.getStats();
  assert.strictEqual(stats4.percentUsed, 100);
  console.log('getStats fallback and clamping: ok');

  console.log('ALL TESTS PASSED');
})().catch((e) => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
