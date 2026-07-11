// Unit tests for src/utils/util.js (pure functions, no DOM needed)

'use strict';

const assert = require('node:assert');

global.window = {};
require('../src/utils/util.js');
const U = global.window.OrangeElephantUtil;

// escapeHtml covers &, <, >, " and '
assert.strictEqual(
  U.escapeHtml(`<b>"a" & 'c'</b>`),
  '&lt;b&gt;&quot;a&quot; &amp; &#39;c&#39;&lt;/b&gt;'
);
assert.strictEqual(U.escapeHtml('plain text'), 'plain text');
console.log('escapeHtml: ok');

// isValidUsername follows HN rules
for (const good of ['pg', 'dang', 'a_b-C9', 'x'.repeat(15)]) {
  assert.strictEqual(U.isValidUsername(good), true, `should accept ${good}`);
}
for (const bad of ['a', '', 'x'.repeat(16), 'a b', 'a"b', "a'b", 'tomás', '<x>', 'a&b', null, undefined, 42]) {
  assert.strictEqual(U.isValidUsername(bad), false, `should reject ${String(bad)}`);
}
console.log('isValidUsername: ok');

// normalizeAnnotation trims, collapses whitespace, caps length
assert.strictEqual(U.normalizeAnnotation('  hi   there\n\tfriend  '), 'hi there friend');
assert.strictEqual(U.normalizeAnnotation('y'.repeat(80)), 'y'.repeat(50));
assert.strictEqual(U.normalizeAnnotation('x'.repeat(49) + ' bcd'), 'x'.repeat(49));
assert.strictEqual(U.normalizeAnnotation('   '), '');
console.log('normalizeAnnotation: ok');

// sanitizeAnnotations rejects non-objects outright
for (const notObj of [null, undefined, 'str', 42, true, ['a', 'b']]) {
  assert.strictEqual(U.sanitizeAnnotations(notObj), null, `should reject ${JSON.stringify(notObj)}`);
}

// ... and drops invalid entries while counting them
const result = U.sanitizeAnnotations({
  pg: 'good',
  a: 'username too short',
  ok_user: '   ',
  'bad"name': 'x',
  longuser: 123,
  'fine-1': '  keep me  ',
});
assert.deepStrictEqual(result.annotations, { pg: 'good', 'fine-1': 'keep me' });
assert.strictEqual(result.skippedCount, 4);

const clean = U.sanitizeAnnotations({});
assert.deepStrictEqual(clean, { annotations: {}, skippedCount: 0 });
console.log('sanitizeAnnotations: ok');

console.log('ALL TESTS PASSED');
