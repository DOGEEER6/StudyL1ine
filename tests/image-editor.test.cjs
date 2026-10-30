const assert = require('node:assert/strict');
const { adjust, rotateRect, pixels } = require('../static/js/image-editor.js');
const bounds = { w: 800, h: 600 };
const rect = { x: 100, y: 50, w: 400, h: 300 };
assert.deepEqual(rotateRect(rect, bounds, true), { x: 250, y: 100, w: 300, h: 400 });
assert.deepEqual(rotateRect(rect, bounds, false), { x: 50, y: 300, w: 300, h: 400 });
let turned = { ...rect }, size = { ...bounds };
for (let i = 0; i < 4; i++) { turned = rotateRect(turned, size, true); size = { w: size.h, h: size.w }; }
assert.deepEqual(turned, rect);
assert.deepEqual(adjust(rect, bounds, 'move', 900, -900), { x: 400, y: 0, w: 400, h: 300 });
assert.deepEqual(adjust(rect, bounds, 'nw', 1000, 1000), { x: 468, y: 318, w: 32, h: 32 });
assert.deepEqual(adjust(rect, bounds, 'se', 1000, 1000), { x: 100, y: 50, w: 700, h: 550 });
assert.deepEqual(pixels({ x: .4, y: .5, w: 799.6, h: 599.5 }, bounds), { x: 0, y: 1, w: 800, h: 599 });
for (const action of ['move','nw','ne','sw','se']) {
  for (const dx of [-10000, -20, 0, 20, 10000]) for (const dy of [-10000,-20,0,20,10000]) {
    const next = adjust(rect, bounds, action, dx, dy);
    assert.ok(next.x >= 0 && next.y >= 0 && next.w >= 32 && next.h >= 32);
    assert.ok(next.x + next.w <= 800 && next.y + next.h <= 600);
  }
}
console.log('PASS: rotation direction/inverse, boundary dragging, minimum size, pixel rounding');

