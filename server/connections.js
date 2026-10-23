import crypto from 'node:crypto';
import content from '../content/photo-connections.json' with { type: 'json' };

export const CONNECTIONS_VERSION = content.version;
const sorted = ids => [...ids].sort().join(',');
const validRequest = id => typeof id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(id);
function newGame() {
  const order = content.tiles.map(t => t.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]];
  }
  return { runId: crypto.randomUUID(), order, solved: [], guesses: [], mistakes: 0, status: 'playing' };
}
function savedFor(session) {
  session.connections ||= {};
  return session.connections[CONNECTIONS_VERSION] ||= newGame();
}
function publicGroup(group, found) {
  return { title: group.title, lead: group.lead, detail: group.detail, facts: group.facts, visual: group.visual, difficulty: group.difficulty, color: group.color, tileIds: group.tileIds, found };
}
export function connectionsState(session) {
  const saved = savedFor(session), ended = saved.status !== 'playing';
  return {
    version: CONNECTIONS_VERSION, runId: saved.runId, title: content.title, fileNumber: content.fileNumber,
    displayMode: content.displayMode, groupSize: content.groupSize, maxMistakes: content.maxMistakes,
    imageUrl: content.imageUrl, photoColumns: content.photoColumns, photoRows: content.photoRows,
    fictionNote: content.fictionNote, demo: true, status: saved.status,
    tiles: saved.order.map(id => content.tiles.find(t => t.id === id)),
    groups: saved.solved.map(id => publicGroup(content.groups.find(g => g.id === id), true)),
    mistakes: saved.mistakes, points: saved.solved.length * content.pointsPerGroup,
    maxPoints: content.groups.length * content.pointsPerGroup, totalGroups: content.groups.length,
    history: saved.guesses.map(g => ({ result: g.feedback.kind, color: g.feedback.color })),
    ...(ended ? { remainingGroups: content.groups.filter(g => !saved.solved.includes(g.id)).map(g => publicGroup(g, false)), reveal: content.reveal } : {})
  };
}
export function connectionsApi({ req, res, pathname, session, body, persist, send }) {
  const saved = savedFor(session);
  if (req.method === 'GET' && pathname === '/api/connections/state') return send(res, 200, connectionsState(session));
  if (req.method !== 'POST') return send(res, 404, { error: '操作が見つかりません。' });
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validRequest(body.requestId)) return send(res, 400, { error: '送信内容を確認できません。' });
  const respond = (code, feedback) => send(res, code, { ...connectionsState(session), ...(feedback ? { feedback } : {}) });
  if (pathname === '/api/connections/reset') {
    if (body.confirm !== true) return send(res, 400, { error: 'やり直しの確認が必要です。' });
    if (saved.previousReset?.requestId === body.requestId && saved.previousReset.runId === body.runId) return respond(200);
    if (body.runId !== saved.runId) return respond(409, { kind: 'stale', message: '別の画面で更新されました。現在の記録を表示します。' });
    const replacement = newGame(); replacement.previousReset = { requestId: body.requestId, runId: body.runId };
    session.connections[CONNECTIONS_VERSION] = replacement; persist(); return respond(200);
  }
  if (!['/api/connections/guess', '/api/connections/reveal'].includes(pathname)) return send(res, 404, { error: '操作が見つかりません。' });
  if (body.runId !== saved.runId) return respond(409, { kind: 'stale', message: '記録が更新されています。写真を選び直してください。' });
  if (pathname === '/api/connections/reveal') {
    if (body.confirm !== true) return send(res, 400, { error: '答えを開く確認が必要です。' });
    if (saved.status === 'playing') { saved.status = 'revealed'; persist(); }
    return respond(200);
  }
  const ids = body.tileIds;
  if (!Array.isArray(ids) || ids.length !== content.groupSize || new Set(ids).size !== content.groupSize || !ids.every(id => typeof id === 'string' && content.tiles.some(t => t.id === id))) return send(res, 400, { error: '異なる写真を４枚選んでください。' });
  const key = sorted(ids), receipt = saved.guesses.find(g => g.requestId === body.requestId);
  if (receipt) return receipt.key === key ? respond(200, receipt.feedback) : send(res, 409, { error: '送信内容が変わっています。写真を選び直してください。', state: connectionsState(session) });
  if (saved.status !== 'playing') return respond(409, { kind: 'ended', message: 'この記録は答え合わせ済みです。' });
  const oldGuess = saved.guesses.find(g => g.key === key);
  if (oldGuess) return respond(200, { kind: 'repeated', message: 'その組み合わせは照合済みです。残り回数は減りません。' });
  const solvedTiles = saved.solved.flatMap(id => content.groups.find(g => g.id === id).tileIds);
  if (ids.some(id => solvedTiles.includes(id))) return respond(409, { kind: 'stale', message: 'すでに繋がった写真が含まれています。選び直してください。' });
  const group = content.groups.find(g => sorted(g.tileIds) === key);
  let feedback;
  if (group) {
    saved.solved.push(group.id);
    feedback = { kind: 'matched', title: group.title, message: group.lead, color: group.color };
    if (saved.solved.length === content.groups.length) saved.status = 'completed';
  } else {
    saved.mistakes++;
    const near = content.groups.filter(g => !saved.solved.includes(g.id)).some(g => ids.filter(id => g.tileIds.includes(id)).length === content.groupSize - 1);
    feedback = { kind: near ? 'near' : 'miss', message: near ? 'あと１枚。３枚は繋がっています。' : 'この４枚の繋がりは、まだ見つかりません。' };
    if (saved.mistakes >= content.maxMistakes) saved.status = 'failed';
  }
  saved.guesses.push({ requestId: body.requestId, key, feedback }); persist(); return respond(200, feedback);
}
