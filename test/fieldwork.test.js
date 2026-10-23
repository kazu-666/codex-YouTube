import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import content from '../content/visual-case.json' with { type: 'json' };

test('visual investigation keeps conclusions server-side, survives retries and restart, and resets independently', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldwork-api-'));
  const port = 33000 + process.pid % 15000, base = `http://127.0.0.1:${port}`;
  let child, cookie;
  async function start() {
    child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), FIELDNOTES_DATA_DIR: dir }, stdio: 'pipe' });
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Server timeout')), 10000); child.stdout.on('data', d => { if (String(d).includes('Game running')) { clearTimeout(timer); resolve(); } }); child.once('exit', c => reject(new Error(`Server exit ${c}`))); });
  }
  async function stop() { if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  async function call(action = 'state', body, options = {}) {
    const r = await fetch(`${base}/api/fieldwork/${action}`, { method: body !== undefined ? 'POST' : 'GET', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options }, body: body !== undefined ? JSON.stringify(body) : undefined });
    cookie ||= r.headers.get('set-cookie')?.split(';')[0];
    return { status: r.status, data: await r.json() };
  }
  try {
    await start();
    let state = (await call()).data;
    for (const k of ['answer', 'solution', 'reveal', 'slots', 'points']) assert.equal(state[k], undefined, `${k} must not be revealed`);
    assert.equal(state.scenes.length, 3); assert.match(state.fictionNote, /創作/);
    assert.ok(fs.statSync(new URL('../web/public' + state.imageUrl, import.meta.url)).size < 550000, 'one small local sprite supplies all four scenes');
    assert.equal((await call('inspect', null)).status, 400);
    assert.equal((await call('inspect', { sceneId: 'missing' })).status, 400);
    assert.equal((await call('inspect', { sceneId: 'shrine' }, { Origin: 'https://other.invalid' })).status, 403);
    const inspections = await Promise.all([call('inspect', { sceneId: 'shrine' }), call('inspect', { sceneId: 'shrine' }), call('inspect', { sceneId: 'veranda' })]);
    assert.ok(inspections.every(r => r.status === 200));
    state = (await call()).data; assert.deepEqual(new Set(state.inspected), new Set(['shrine', 'veranda']));
    const requestId = crypto.randomUUID(), answer = { requestId, words: content.solution };
    assert.equal((await call('answer', answer)).status, 409, 'explicitly open the conclusion before committing');
    state = (await call('options', {})).data; assert.equal(state.slots.length, 2); assert.equal(state.reveal, undefined);
    assert.equal((await call('answer', { requestId, words: { shape: 'breast' } })).status, 400);
    assert.equal((await call('answer', { requestId, words: { shape: 'breast', purpose: 'unknown' } })).status, 400);
    const duplicate = await Promise.all([call('answer', answer), call('answer', answer)]);
    assert.ok(duplicate.every(r => r.status === 200 && r.data.answer.points === 100));
    assert.equal((await call('answer', { requestId, words: { purpose: 'milk', shape: 'breast' } })).status, 200, 'retry may reorder object keys');
    assert.equal((await call('answer', { requestId, words: { purpose: 'ward', shape: 'eyes' } })).status, 409);
    assert.equal((await call('answer', { ...answer, requestId: crypto.randomUUID() })).status, 409);
    state = (await call()).data; assert.equal(state.reveal.source.url, content.reveal.source.url);
    await stop(); await start();
    state = (await call()).data; assert.equal(state.answer.points, 100); assert.equal(state.inspected.length, 2);
    const old = await fetch(base + '/api/casebook/state', { headers: { Cookie: cookie } }).then(r => r.json()); assert.equal(old.total, 0);
    assert.equal((await call('reset', {})).status, 400);
    state = (await call('reset', { confirm: true })).data; assert.equal(state.answer, undefined); assert.equal(state.inspected.length, 0);
    await call('options', {});
    state = (await call('answer', { requestId: crypto.randomUUID(), words: { shape: 'eyes', purpose: 'milk' } })).data;
    assert.equal(state.answer.points, 60); assert.deepEqual(state.answer.matched, ['purpose']); assert.ok(state.reveal.story);
    await call('reset', { confirm: true }); await call('options', {});
    state = (await call('answer', { requestId: crypto.randomUUID(), words: null })).data;
    assert.equal(state.answer.points, 0); assert.ok(state.reveal.source);
    const stranger = await fetch(base + '/api/fieldwork/state').then(r => r.json()); assert.equal(stranger.answer, undefined);
  } finally { await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
