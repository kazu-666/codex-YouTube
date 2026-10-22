import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import questions from '../content/questions.json' with { type: 'json' };

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('five answers, saved progress, one-answer rule, hints and results', { timeout: 20000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldnotes-test-'));
  const port = 14000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: 'production', FIELDNOTES_DATA_DIR: dataDir }, stdio: 'pipe' });
  let log = '';
  child.stderr.on('data', chunk => { log += chunk; });
  try {
    let ready = false;
    for (let n = 0; n < 50; n++) {
      try { const response = await fetch(`http://127.0.0.1:${port}/api/state`); if (response.ok) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, `server did not start: ${log}`);
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal(health.headers.get('set-cookie'), null);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await page.text();
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    const script = await fetch(`http://127.0.0.1:${port}${asset}`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    let cookie;
    async function call(route, body, roundId = 'first') {
      if (!body && route === '/api/state') route += `?round=${roundId}`;
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify({ ...body, roundId }) : undefined });
      cookie ||= response.headers.get('set-cookie')?.split(';')[0];
      return { status: response.status, data: await response.json() };
    }
    let result = await call('/api/state');
    assert.equal(result.data.questions.length, 5);
    assert.equal(result.data.questions[0].coordinate, undefined);
    assert.equal(result.data.questions[0].fact, undefined);
    assert.equal(result.data.questions[0].title, undefined);
    assert.equal(result.data.questions[0].sources, undefined);
    assert.match(result.data.questions[0].id, /^[a-f0-9]{6}$/);
    assert.equal((await call('/api/state', null, 'bogus')).status, 400);
    assert.equal((await call('/api/answer', { questionId: result.data.questions[1].id, lat: 35, lng: 135 })).status, 409);
    assert.equal((await call('/api/answer', { questionId: result.data.questions[0].id, lat: 91, lng: 135 })).status, 400);
    assert.equal((await call('/api/hint', { questionId: result.data.questions[0].id })).status, 403);
    assert.equal((await call('/api/demo-plan', { plan: 'premium' })).status, 200);
    assert.equal((await call('/api/hint', { questionId: result.data.questions[0].id })).status, 200);
    for (let i = 0; i < 5; i++) {
      const q = result.data.questions[i];
      result = await call('/api/answer', { questionId: q.id, lat: 0, lng: 0 });
      assert.equal(result.status, 200);
      assert.equal(result.data.questions[i].answer.guess[0], 0);
      assert.equal(result.data.questions[i].sources.length > 0, true);
      assert.equal((await call('/api/answer', { questionId: q.id, lat: 0, lng: 0 })).status, 409);
    }
    assert.equal(result.data.completed, true);
    assert.equal(result.data.maxTotal, 1000);
    assert.equal(result.data.questions[0].answer.usedHint, true);
    assert.equal((await call('/api/state')).data.total, result.data.total);
    const second = await call('/api/state', null, 'second');
    assert.equal(second.data.completed, false);
    assert.equal(second.data.total, 0);
    assert.ok(second.data.questions.every(q => !q.answer));
    assert.ok(second.data.questions.every(q => !result.data.questions.find(other => other.id === q.id)));
    assert.equal((await call('/api/answer', { questionId: second.data.questions[0].id, lat: 35, lng: 135 }, 'first')).status, 400);
    const target = questions.find(q => q.id === second.data.questions[0].id);
    const exact = await call('/api/answer', { questionId: target.id, lat: target.coordinate[0], lng: target.coordinate[1] }, 'second');
    assert.equal(exact.status, 200);
    assert.equal(exact.data.questions[0].answer.points, 100);
    assert.equal(exact.data.questions[0].answer.distanceKm, 0);
    assert.equal(exact.data.questions[0].answer.withinRadius, true);
    assert.equal((await call('/api/state')).data.completed, true, 'switching must preserve finished first-volume answers');
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
