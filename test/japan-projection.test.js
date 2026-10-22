import test from 'node:test';
import assert from 'node:assert/strict';
import { toGlobe, fromGlobe, globeVector, coordinateFromVector } from '../web/japan-projection.js';
import questions from '../content/questions.json' with { type: 'json' };

test('Japan occupies most of the display globe and clicks recover real coordinates', () => {
  assert.ok(toGlobe([45.5, 145])[0] > 60);
  assert.ok(toGlobe([24.2, 123])[1] < -70);
  for (const point of questions.map(q => q.coordinate).concat([[24.2,123], [45.5,145]])) {
    const roundTrip = fromGlobe(toGlobe(point));
    const pick = coordinateFromVector(globeVector(point));
    point.forEach((n,i) => {
      assert.ok(Math.abs(n-roundTrip[i])<1e-8);
      assert.ok(Math.abs(n-pick[i])<1e-8, 'raycast/display conversion must not change the scoring location');
    });
  }
});
