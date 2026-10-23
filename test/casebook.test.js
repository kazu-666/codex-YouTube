import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import cases from '../content/deduction-cases.json' with { type: 'json' };
import { CASEBOOK_VERSION, casebookState } from '../server/casebook.js';

test('deduction manuscripts have two solvable slots, consulted sources and locally available illustration assets', () => {
  assert.equal(cases.length, 3);
  for (const c of cases) {
    assert.equal(c.report.slots.length, 2); assert.equal(c.report.parts.length, 3);
    assert.equal(c.clues.length, 2);
    for (const slot of c.report.slots) {
      assert.equal(slot.options.length, 3);
      assert.ok(slot.options.some(option => option.id === c.solution[slot.id]));
    }
    assert.equal(c.review.story, 'official_text_consulted');
    assert.ok(c.sources.every(s => s.url.startsWith('https://') && s.readAt));
    assert.ok(fs.existsSync(new URL('../web/public' + c.sceneUrl, import.meta.url)));
    assert.ok(fs.existsSync(new URL('../content/report-images/' + c.location.photoId + '.jpg', import.meta.url)));
  }
  const state = casebookState({ plan: 'free' });
  assert.equal(state.contentVersion, CASEBOOK_VERSION);
  assert.equal(state.maxTotal, 300);
  assert.equal(state.cases[1].title, undefined, 'unavailable future cases expose no content');
});

test('casebook separates evidence, committed report and location; records incorrect results and persists without duplicate points', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casebook-api-'));
  const port = 32000 + process.pid % 20000, base = `http://127.0.0.1:${port}`;
  let child, cookie;
  async function start() {
    child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), FIELDNOTES_DATA_DIR: dir }, stdio: 'pipe' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      child.stdout.on('data', data => { if (String(data).includes('Game running')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exit ${code}`)); });
    });
  }
  async function call(action = 'state', body) {
    const response = await fetch(`${base}/api/casebook/${action}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    cookie ||= response.headers.get('set-cookie')?.split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  async function stop() { await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  function noPlace(c) { for (const key of ['location', 'sources', 'sourceKind', 'recorded']) assert.equal(c[key], undefined, `${key} is withheld until the location reveal`); }
  try {
    await start();
    let state = (await call()).data; const first = cases[0], second = cases[1], third = cases[2];
    noPlace(state.cases[0]);
    assert.equal(state.cases[0].answer, undefined); assert.equal(state.cases[0].report, undefined);
    assert.equal(state.cases[0].clues[0].body, undefined);
    assert.equal((await call('record', { caseId: first.id })).status, 409);
    const invalidBody = await fetch(base + '/api/casebook/answer', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: 'null' });
    assert.equal(invalidBody.status, 400);
    assert.equal((await call('options', { caseId: second.id })).status, 409);
    assert.equal((await call('photo/' + first.id + '.jpg')).status, 403);
    assert.equal((await call('evidence', { caseId: first.id, clueId: 'no' })).status, 400);
    state = (await call('evidence', { caseId: first.id, clueId: 'a' })).data;
    assert.ok(state.cases[0].clues[0].body); noPlace(state.cases[0]);
    state = (await call('options', { caseId: first.id })).data;
    assert.equal(state.cases[0].report.slots.length, 2); noPlace(state.cases[0]);
    assert.equal(state.cases[0].solution, undefined);
    const requestId = crypto.randomUUID(), valid = { caseId: first.id, words: first.solution, requestId };
    assert.equal((await call('answer', { ...valid, words: { who: 'b' } })).status, 400);
    const results = await Promise.all([call('answer', valid), call('answer', valid)]);
    assert.ok(results.every(r => r.status === 200));
    state = results[0].data; noPlace(state.cases[0]);
    assert.equal(state.cases[0].answer.points, 100); assert.equal(state.total, 100);
    assert.equal((await call('answer', { ...valid, words: { why: 'c', who: 'b' } })).status, 200, 'retry ignores object key order');
    assert.equal((await call('answer', { ...valid, words: { who: 'a', why: 'c' } })).status, 409);
    assert.equal((await call('answer', { ...valid, requestId: crypto.randomUUID() })).status, 409);
    assert.equal((await call('photo/' + first.id + '.jpg')).status, 403, 'answering alone does not reveal the location photo');
    assert.equal((await call('options', { caseId: second.id })).status, 409, 'the location is recorded before next case');
    state = (await call('record', { caseId: first.id })).data;
    assert.equal(state.collection.length, 1); assert.equal(state.cases[0].location.prefecture, '宮崎県');
    state = (await call('record', { caseId: first.id })).data;
    assert.equal(state.collection.length, 1);
    const photo = await fetch(base + state.cases[0].location.photoUrl, { headers: { Cookie: cookie } });
    assert.equal(photo.status, 200); assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(base + state.cases[0].location.photoUrl)).status, 403, 'another anonymous session is isolated');
    await call('options', { caseId: second.id });
    const partial = (await call('answer', { caseId: second.id, words: { who: 'b', why: 'c' }, requestId: crypto.randomUUID() })).data;
    assert.equal(partial.cases[1].answer.matched, 1); assert.equal(partial.cases[1].answer.points, 50);
    state = (await call('record', { caseId: second.id })).data;
    assert.equal(state.collection.length, 2, 'partial answers also enter the map');
    await call('options', { caseId: third.id });
    state = (await call('answer', { caseId: third.id, words: null, requestId: crypto.randomUUID() })).data;
    assert.equal(state.cases[2].answer.points, 0); noPlace(state.cases[2]);
    state = (await call('record', { caseId: third.id })).data;
    assert.equal(state.completed, true); assert.equal(state.collection.length, 3); assert.equal(state.total, 150);
    await stop(); await start();
    const restored = (await call()).data;
    assert.equal(restored.completed, true); assert.equal(restored.total, 150); assert.equal(restored.collection.length, 3);
    const legacy = await fetch(base + '/api/state?round=first', { headers: { Cookie: cookie } });
    assert.equal((await legacy.json()).questions.filter(q => q.answer).length, 0, 'old map-game progress is separate');
    const foreignOrigin = await fetch(base + '/api/casebook/options', { method: 'POST', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ caseId: first.id }) });
    assert.equal(foreignOrigin.status, 403);
  } finally { if (child?.exitCode === null) await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
