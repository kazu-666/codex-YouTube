import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyKey, roundFor, distanceKm, score, POINTS } from '../server/game.js';

test('Tokyo calendar day drives one shared five-place round', () => {
  assert.equal(dailyKey(new Date('2026-10-21T15:01:00Z')), '2026-10-22');
  const round = roundFor('2026-10-22');
  assert.equal(round.length, 5);
  assert.equal(new Set(round.map(q => q.id)).size, 5);
  assert.equal(POINTS.reduce((sum, n) => sum + n, 0), 1000);
});

test('distance and score preserve exact-hit maximum and lower distant scores', () => {
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
  assert.ok(distanceKm([0, 0], [0, 90]) > 9900);
  assert.equal(score(0, 4), 300);
  assert.ok(score(2000, 4) < score(100, 4));
});
