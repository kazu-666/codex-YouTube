import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import questions from '../content/questions.json' with { type: 'json' };
import { investigationStage, publicQuestion } from '../server/game.js';

test('distance tiers are precise and opened records never regress when a later check is farther away', () => {
  assert.equal(investigationStage(100.001), 0);
  assert.equal(investigationStage(100), 1);
  assert.equal(investigationStage(20), 2);
  assert.equal(investigationStage(1.001), 2);
  assert.equal(investigationStage(1), 3);
  const q = publicQuestion(questions[0], 0, false, [{ guess: [35, 135], distanceKm: 10, rawDistance: 10.01 }, { guess: [30, 130], distanceKm: 500, rawDistance: 500 }]);
  assert.equal(q.stage, 2); assert.equal(q.unlocked.length, 2);
  assert.ok(q.attempts.every(a => !('rawDistance' in a)));
});

test('all ten real site maps have attribution, a target crosshair, and reasonable compressed size', () => {
  for (const q of questions) {
    const [w, s, e, n] = q.investigation.bounds;
    assert.ok(q.coordinate[0] > s && q.coordinate[0] < n && q.coordinate[1] > w && q.coordinate[1] < e, q.id);
    const svg = fs.readFileSync(new URL(`../content/evidence/${q.id}.svg`, import.meta.url));
    const text = svg.toString();
    assert.match(text, /OpenStreetMap/); assert.match(text, /cx="320" cy="200"/);
    assert.ok(!text.includes(q.ja.title)); assert.ok(!text.includes(String(q.coordinate[0])));
    assert.ok(gzipSync(svg).length < 200000, `${q.id} must not require a large image download`);
    const photo = fs.readFileSync(new URL(`../content/evidence/${q.id}.jpg`, import.meta.url));
    assert.ok(photo.length < 150000 && photo[0] === 255 && photo[1] === 216);
  }
});
