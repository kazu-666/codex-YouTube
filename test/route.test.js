import test from 'node:test';
import assert from 'node:assert/strict';
import { pointAlong, routeBetween } from '../web/route.js';

test('reveal grows from the guess to the answer along the earth', () => {
  const a = [35, 135], b = [41, 141];
  assert.deepEqual(pointAlong(a, b, 0), [135, 35]);
  assert.deepEqual(pointAlong(a, b, 1), [141, 41]);
  const partial = routeBetween(a, b, .4).geometry.coordinates.flat();
  assert.ok(partial.at(-1)[0] > 135 && partial.at(-1)[0] < 141);
  assert.deepEqual(routeBetween(a, b).geometry.coordinates.flat().at(-1), [141, 41]);
});

test('antimeridian, exact hits and antipodal guesses remain finite and connected', () => {
  for (const [a, b] of [[[20, 170], [20, -170]], [[0, 0], [0, 180]], [[35, 135], [35, 135]]]) {
    const route = routeBetween(a, b);
    for (const line of route.geometry.coordinates) {
      for (const point of line) assert.ok(point.every(Number.isFinite));
      for (let i = 1; i < line.length; i++) assert.ok(Math.abs(line[i][0] - line[i - 1][0]) <= 180);
    }
    assert.deepEqual(route.geometry.coordinates.at(-1).at(-1), [b[1], b[0]]);
  }
  assert.equal(routeBetween([20, 170], [20, -170]).geometry.coordinates.length, 2);
});
