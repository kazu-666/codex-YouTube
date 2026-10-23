import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import content from '../content/photo-connections.json' with { type: 'json' };
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
test('12 photographs have three disjoint groups; initial state hides categories and editor membership', () => {
  const h = harness(), s = h.state();
  assert.equal(s.tiles.length, 12); assert.equal(new Set(s.tiles.map(t => t.id)).size, 12);
  assert.equal(new Set(content.groups.flatMap(g => g.tileIds)).size, 12);
  assert.equal(s.totalGroups, 3); assert.equal(s.maxPoints, 300); assert.equal(s.displayMode, 'photos');
  assert.ok(s.tiles.every(t => t.label && t.reading && t.alt && Number.isInteger(t.panel))); assert.equal(s.photoColumns, 4); assert.equal(s.photoRows, 3); assert.equal(s.editor, undefined);
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
test('correct sets reveal only their own interpretation, score once, and complete at 300', () => {
  const h = harness(), key = crypto.randomUUID(), first = content.groups[0].tileIds;
  assert.equal(h.guess(first, key).data.feedback.kind, 'matched');
  assert.equal(h.guess(first.toReversed(), key).data.points, 100); assert.equal(h.saves(), 1);
  assert.equal(h.state().reveal, undefined); assert.equal(h.state().groups.length, 1);
  for (const g of content.groups.slice(1)) assert.equal(h.guess(g.tileIds).status, 200);
  const s = h.state(); assert.equal(s.status, 'completed'); assert.equal(s.points, 300); assert.equal(s.groups.length, 3);
  assert.deepEqual(s.reveal, content.reveal); assert.deepEqual(s.remainingGroups, []);
  assert.equal(h.guess(first).status, 409); assert.equal(h.state().points, 300);
});
test('four distinct misses end the puzzle and reveal all remaining groups', () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    const ids = [content.groups[0].tileIds[i], content.groups[0].tileIds[(i + 1) % 4], content.groups[1].tileIds[i], content.groups[2].tileIds[i]];
    assert.equal(h.guess(ids).status, 200);
  }
  assert.equal(h.state().status, 'failed'); assert.equal(h.state().mistakes, 4);
  assert.equal(h.state().remainingGroups.length, 3); assert.equal(h.state().points, 0);
  assert.equal(h.guess(content.groups[0].tileIds).status, 409);
});
test('reveal preserves earned points; reset isolates stale guesses and handles reset retries', () => {
  const h = harness(); h.guess(content.groups[0].tileIds);
  const oldRun = h.state().runId;
  assert.equal(h.post('reveal', { requestId: crypto.randomUUID(), runId: oldRun, confirm: true }).status, 200);
  assert.equal(h.state().status, 'revealed'); assert.equal(h.state().points, 100);
  assert.equal(h.state().remainingGroups.length, 2);
  const body = { requestId: crypto.randomUUID(), runId: oldRun, confirm: true };
  assert.equal(h.post('reset', body).status, 200);
  const newRun = h.state().runId; assert.notEqual(newRun, oldRun);
  assert.equal(h.post('reset', body).data.runId, newRun);
  assert.equal(h.guess(content.groups[0].tileIds, crypto.randomUUID(), oldRun).status, 409);
  assert.equal(h.state().points, 0); assert.equal(h.state().mistakes, 0); assert.equal(h.state().status, 'playing');
});

test('body materials cross the authored use groups; visual evidence stays consistent', () => {
  for (const material of ['髪', '歯', '爪', '骨']) {
    const groups = content.groups.filter(g => g.tileIds.some(id => content.editor.materialTags[id].includes(material)));
    assert.ok(groups.length >= 2, `${material} must cross functional groups`);
  }
  for (const g of content.groups) {
    assert.deepEqual(g.facts.map(f => f.tileId), g.tileIds);
    assert.ok(g.facts.every(f => f.from && f.to));
    assert.ok(['effigy', 'confinement', 'seal'].includes(g.visual));
    assert.ok(g.relation);
  }
  const publicState = JSON.stringify(harness().state());
  assert.ok(!publicState.includes('materialTags'));
  assert.ok(!publicState.includes('membership'));
  assert.equal(content.reveal.sources.length, 0, 'fiction has no fabricated historical citations');
  assert.ok(content.reveal.fiction.includes('フィクション'));
});

test('the new case does not inherit completion from the mythology puzzle', () => {
  const h = harness();
  h.session.connections = { 'kojiki-photos-v1': { status: 'completed', solved: ['toothed-tools', 'escape-from-yomi', 'born-from-body'] } };
  const current = h.state();
  assert.equal(current.version, 'house-inheritance-v1');
  assert.equal(current.status, 'playing');
  assert.equal(current.points, 0);
  assert.equal(current.tiles.length, 12);
  assert.equal(h.session.connections['kojiki-photos-v1'].status, 'completed');
});
