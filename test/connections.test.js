import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import content from '../content/image-connections.json' with { type: 'json' };
import { connectionsApi, connectionsState } from '../server/connections.js';

function harness() {
  const session = {}; let saves = 0;
  const state = () => connectionsState(session);
  function post(action, body) {
    let response;
    connectionsApi({ req: { method: 'POST' }, res: {}, pathname: `/api/connections/${action}`, session, body,
      persist: () => saves++, send: (_res, status, data) => response = { status, data } });
    return response;
  }
  const guess = (ids, requestId = crypto.randomUUID(), runId = state().runId) => post('guess', { tileIds: ids, requestId, runId });
  return { session, state, post, guess, saves: () => saves };
}
test('16 photo puzzle has four disjoint observable groups; initial state hides all answers', () => {
  const h = harness(), s = h.state();
  assert.equal(s.tiles.length, 16); assert.equal(new Set(s.tiles.map(t => t.id)).size, 16);
  assert.equal(new Set(content.groups.flatMap(g => g.tileIds)).size, 16);
  for (const g of content.groups) assert.equal(g.tileIds.length, 4);
  assert.deepEqual(s.groups, []); assert.equal(s.reveal, undefined); assert.equal(s.remainingGroups, undefined);
  const serialized = JSON.stringify(s);
  for (const g of content.groups) { assert.ok(!serialized.includes(g.title)); assert.ok(!serialized.includes(g.id)); }
  assert.deepEqual(h.state().tiles, s.tiles, 'same session keeps the shuffled board');
});
test('guesses validate membership and uniqueness, and cannot spend attempts with malformed bodies', () => {
  const h = harness();
  for (const ids of [null, [], ['e7a2'], Array(4).fill('e7a2'), ['e7a2', 'd8b4', 'b4a8', 'invalid'], [1, 2, 3, 4]]) assert.equal(h.guess(ids).status, 400);
  assert.equal(h.post('guess', null).status, 400);
  assert.equal(h.saves(), 0); assert.equal(h.state().mistakes, 0);
});
test('a three-of-four guess gets close feedback; repeats and retry cannot spend a second life', () => {
  const h = harness(), near = [...content.groups[0].tileIds.slice(0, 3), content.groups[1].tileIds[0]], key = crypto.randomUUID();
  assert.equal(h.guess(near, key).data.feedback.kind, 'near'); assert.equal(h.state().mistakes, 1);
  assert.equal(h.guess(near.toReversed(), key).status, 200); assert.equal(h.saves(), 1);
  assert.equal(h.guess(near).data.feedback.kind, 'repeated'); assert.equal(h.state().mistakes, 1);
  assert.equal(h.guess(content.groups[0].tileIds, key).status, 409); assert.equal(h.state().points, 0);
});
test('correct sets reveal only their own interpretation, score once, and complete at 400', () => {
  const h = harness(), key = crypto.randomUUID(), first = content.groups[0].tileIds;
  assert.equal(h.guess(first, key).data.feedback.kind, 'matched');
  assert.equal(h.guess(first.toReversed(), key).data.points, 100); assert.equal(h.saves(), 1);
  assert.equal(h.state().reveal, undefined); assert.equal(h.state().groups.length, 1);
  for (const g of content.groups.slice(1)) assert.equal(h.guess(g.tileIds).status, 200);
  const s = h.state(); assert.equal(s.status, 'completed'); assert.equal(s.points, 400); assert.equal(s.groups.length, 4);
  assert.ok(s.reveal.sources.length); assert.deepEqual(s.remainingGroups, []);
  assert.equal(h.guess(first).status, 409); assert.equal(h.state().points, 400);
});
test('four distinct misses end the puzzle and reveal all remaining groups', () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    const ids = content.groups.map((g, index) => g.tileIds[(i + index) % 4]);
    assert.equal(h.guess(ids).status, 200);
  }
  assert.equal(h.state().status, 'failed'); assert.equal(h.state().mistakes, 4);
  assert.equal(h.state().remainingGroups.length, 4); assert.equal(h.state().points, 0);
  assert.equal(h.guess(content.groups[0].tileIds).status, 409);
});
test('reveal preserves earned points; reset isolates stale guesses and handles reset retries', () => {
  const h = harness(); h.guess(content.groups[0].tileIds);
  const oldRun = h.state().runId;
  assert.equal(h.post('reveal', { requestId: crypto.randomUUID(), runId: oldRun, confirm: true }).status, 200);
  assert.equal(h.state().status, 'revealed'); assert.equal(h.state().points, 100);
  assert.equal(h.state().remainingGroups.length, 3);
  const body = { requestId: crypto.randomUUID(), runId: oldRun, confirm: true };
  assert.equal(h.post('reset', body).status, 200);
  const newRun = h.state().runId; assert.notEqual(newRun, oldRun);
  assert.equal(h.post('reset', body).data.runId, newRun);
  assert.equal(h.guess(content.groups[0].tileIds, crypto.randomUUID(), oldRun).status, 409);
  assert.equal(h.state().points, 0); assert.equal(h.state().mistakes, 0); assert.equal(h.state().status, 'playing');
});
