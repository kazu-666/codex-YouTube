import test from 'node:test';
import assert from 'node:assert/strict';
import { toGlobe, fromGlobe, globeVector, coordinateFromVector } from '../web/japan-projection.js';
import questions from '../content/questions.json' with { type: 'json' };
import land from '../web/japan-land.json' with { type: 'json' };

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

test('Japan spans nearly a full turn without folding across a latitude pole', () => {
  const coordinates=land.geometry.coordinates.flat(2).map(([lng,lat])=>[lat,lng]);
  const angles=coordinates.map(toGlobe);
  const width=Math.max(...angles.map(p=>p[1]))-Math.min(...angles.map(p=>p[1]));
  assert.ok(width>280 && width<340, `Japan should occupy most of a full turn: ${width}`);
  for(const point of coordinates){
    assert.ok(Math.abs(toGlobe(point)[0])<90);
    const pick=coordinateFromVector(globeVector(point));
    point.forEach((n,i)=>assert.ok(Math.abs(n-pick[i])<1e-7));
  }
});
