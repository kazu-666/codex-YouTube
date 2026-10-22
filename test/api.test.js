import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import questions from '../content/questions.json' with { type: 'json' };
import { score, distanceKm } from '../server/game.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('investigations save three checks, unlock by closest distance, hide destinations and reject duplicate mutations', { timeout: 25000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'georoots-api-'));
  const port = 14000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), NODE_ENV: 'production', FIELDNOTES_DATA_DIR: dir }, stdio: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  let cookie;
  async function call(route, body, roundId = 'first') {
    if (!body) route += `${route.includes('?') ? '&' : '?'}round=${roundId}`;
    const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify({ ...body, roundId }) : undefined });
    cookie ||= response.headers.get('set-cookie')?.split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  const check = (id, coord, expectedAttempt, requestId = crypto.randomUUID(), roundId = 'first') => call('/api/answer', { questionId: id, lat: coord[0], lng: coord[1], expectedAttempt, requestId }, roundId);
  try {
    for (let n = 0; n < 70; n++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await delay(80); }
    assert.equal((await fetch(base + '/healthz')).status, 200);
    let { data: state } = await call('/api/state');
    assert.equal(state.questions.length, 5);
    assert.equal(state.contentVersion, 'japan-investigation-v3');
    const id = state.questions[0].id, target = questions.find(q => q.id === id);
    function hidden(q) {
      for (const key of ['coordinate', 'title', 'fact', 'summary', 'sources', 'answer']) assert.equal(q[key], undefined, `${key} must remain private`);
      assert.ok(q.attempts.every(a => a.rawDistance === undefined));
    }
    hidden(state.questions[0]);
    assert.equal(state.questions[0].stage, 0);
    assert.equal((await call('/api/state', null, 'bogus')).status, 400);
    assert.equal((await check(state.questions[1].id, [35, 135], 0)).status, 409);
    assert.equal((await check(id, [91, 135], 0)).status, 400);
    assert.equal((await call('/api/answer', { questionId: id, lat: 35, lng: 135 })).status, 400);
    assert.equal((await call('/api/hint', { questionId: id })).status, 403);
    const photo = await fetch(`${base}${state.questions[0].evidenceUrl}?round=first`, { headers: { Cookie: cookie } });
    assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    const photoBytes = new Uint8Array(await photo.arrayBuffer());
    assert.equal(photoBytes[0], 255); assert.equal(photoBytes[1], 216);
    const evidence = await fetch(`${base}${state.questions[0].mapEvidenceUrl}?round=first`, { headers: { Cookie: cookie } });
    assert.equal(evidence.status, 200);
    const svg = await evidence.text();
    assert.match(svg, /OpenStreetMap/); assert.match(svg, /<path/);
    assert.ok(!svg.includes(target.ja.title)); assert.ok(!svg.includes(String(target.coordinate[0])));
    assert.equal((await fetch(base + '/api/evidence/ffffff.svg?round=first')).status, 404);
    const requestId = crypto.randomUUID();
    const firstCoord = [target.coordinate[0] + .5, target.coordinate[1]];
    const requests = await Promise.all([check(id, firstCoord, 0, requestId), check(id, firstCoord, 0, requestId)]);
    assert.ok(requests.every(r => r.status === 200), 'same request is idempotent');
    state = (await call('/api/state')).data;
    assert.equal(state.questions[0].attempts.length, 1); assert.equal(state.questions[0].stage, 1);
    assert.equal(state.questions[0].unlocked.length, 1); hidden(state.questions[0]);
    assert.equal((await check(id, firstCoord, 0)).status, 409, 'stale attempt number cannot consume another check');
    const nearCoord = [target.coordinate[0] + .08, target.coordinate[1]];
    state = (await check(id, nearCoord, 1)).data;
    assert.equal(state.questions[0].stage, 2); assert.equal(state.questions[0].unlocked.length, 2); hidden(state.questions[0]);
    state = (await check(id, [target.coordinate[0] + 2, target.coordinate[1]], 2)).data;
    assert.equal(state.questions[0].answer.reason, 'limit');
    assert.equal(state.questions[0].attempts.length, 3);
    assert.deepEqual(state.questions[0].answer.guess, nearCoord, 'best attempt determines score and displayed route');
    assert.equal(state.questions[0].answer.points, score(distanceKm(nearCoord, target.coordinate), 0));
    assert.equal((await check(id, target.coordinate, 3)).status, 409);
    assert.equal((await check(id, firstCoord, 0, requestId)).status, 200, 'retry remains idempotent after finalization');
    const next = state.questions[1], nextTarget = questions.find(q => q.id === next.id);
    state = (await check(next.id, nextTarget.coordinate, 0)).data;
    assert.equal(state.questions[1].answer.withinRadius, true); assert.equal(state.questions[1].answer.points, 150);
    assert.equal(state.questions[1].answer.reason, 'located');
    const third = state.questions[2];
    const race = await Promise.all([check(third.id, [35, 135], 0), check(third.id, [36, 136], 0)]);
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
    state = (await call('/api/reveal', { questionId: third.id })).data;
    assert.equal(state.questions[2].answer.attemptCount, 1);
    for (const q of state.questions.slice(3)) state = (await call('/api/reveal', { questionId: q.id })).data;
    assert.equal(state.completed, true); assert.equal(state.maxTotal, 1000);
    assert.equal(state.questions[3].answer.points, 0); assert.equal(state.questions[3].answer.guess, null);
    assert.equal((await call('/api/state')).data.total, state.total);
    const second = (await call('/api/state', null, 'second')).data;
    assert.ok(second.questions.every(q => !q.answer && q.attempts.length === 0));
    assert.equal((await call('/api/demo-plan', { plan: 'premium' }, 'second')).status, 200);
    const hint = await call('/api/hint', { questionId: second.questions[0].id }, 'second');
    assert.ok(hint.data.questions[0].extraHint);
    const secondTarget = questions.find(q => q.id === second.questions[0].id);
    const exact = await check(secondTarget.id, secondTarget.coordinate, 0, crypto.randomUUID(), 'second');
    assert.equal(exact.data.questions[0].answer.usedHint, true);
    assert.equal(exact.data.questions[0].answer.points, 100);
    assert.equal((await call('/api/state')).data.completed, true, 'volumes stay isolated');
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});
