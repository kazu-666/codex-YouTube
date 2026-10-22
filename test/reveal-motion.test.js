import test from 'node:test';
import assert from 'node:assert/strict';
import { glide } from '../web/reveal-motion.js';
import { routeBetween, pointAlong } from '../web/route.js';

test('travel starts and arrives gently and never reverses',()=>{
  assert.equal(glide(0),0);assert.equal(glide(1),1);
  assert.ok(glide(.01)<.00002);
  assert.ok(1-glide(.99)<.00002);
  let previous=0;
  for(let i=0;i<=100;i++){const value=glide(i/100);assert.ok(value>=previous && value<=1);previous=value;}
});
test('a moving trail follows only the recent part of a route',()=>{
  const a=[35,135],b=[40,141];
  const points=routeBetween(a,b,.7,.5).geometry.coordinates.flat();
  assert.deepEqual(points[0],pointAlong(a,b,.5));
  assert.deepEqual(points.at(-1),pointAlong(a,b,.7));
});
