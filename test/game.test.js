import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyKey, defaultRound, roundFor, distanceKm, score, POINTS } from '../server/game.js';
import questions from '../content/questions.json' with { type: 'json' };

test('Tokyo calendar day drives one shared five-place round', () => {
  assert.equal(dailyKey(new Date('2026-10-21T15:01:00Z')), '2026-10-22');
  const round = roundFor('2026-10-22');
  assert.equal(round.length, 5);
  assert.equal(new Set(round.map(q => q.id)).size, 5);
  assert.equal(POINTS.reduce((sum, n) => sum + n, 0), 1000);
});

test('two disjoint five-place volumes contain all ten authored questions', () => {
  const first = roundFor('2026-10-22', 'first');
  const second = roundFor('2026-10-22', 'second');
  assert.equal(questions.length, 10);
  assert.equal(first.length, 5);
  assert.equal(second.length, 5);
  assert.equal(new Set([...first, ...second].map(q => q.id)).size, 10);
  assert.notEqual(defaultRound('2026-10-22'), defaultRound('2026-10-23'));
  assert.throws(() => roundFor('2026-10-22', 'bogus'));
  for (const q of questions) {
    assert.ok(q.coordinate[0] > 24 && q.coordinate[0] < 46);
    assert.ok(q.coordinate[1] > 123 && q.coordinate[1] < 146);
    for (const locale of ['ja', 'en']) {
      for (const field of ['title', 'hook', 'hint', 'extraHint', 'fact', 'summary']) assert.ok(q[locale][field]?.trim());
    }
    assert.ok(q.sources.length);
    assert.equal(q.status, 'needs_review', 'Drafts must not claim publication review');
  }
});

test('Japan scoring tolerates a precinct and distinguishes regional guesses', () => {
  assert.equal(score(1, 4), 300);
  assert.equal(score(.2, 0), 100);
  assert.ok(score(10, 4) > score(50, 4));
  assert.ok(POINTS.reduce((sum, _, i) => sum + score(100, i), 0) < 700);
  assert.ok(score(1000, 4) < 10);
});

test('distance and score preserve exact-hit maximum and lower distant scores', () => {
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
  assert.ok(distanceKm([0, 0], [0, 90]) > 9900);
  assert.equal(score(0, 4), 300);
  assert.ok(score(2000, 4) < score(100, 4));
});
