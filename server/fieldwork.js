import content from '../content/visual-case.json' with { type: 'json' };

export const FIELDWORK_VERSION = content.id;
function savedFor(session) {
  session.fieldwork ||= {};
  return session.fieldwork[FIELDWORK_VERSION] ||= { inspected: [], optionsOpened: false };
}
export function fieldworkState(session) {
  const saved = savedFor(session);
  const { solution, points, reveal, slots, ...intro } = content;
  return { ...intro, version: FIELDWORK_VERSION, demo: true, maxPoints: 100,
    inspected: saved.inspected, optionsOpened: saved.optionsOpened,
    ...(saved.optionsOpened || saved.answer ? { slots } : {}),
    ...(saved.answer ? { answer: saved.answer, solution, reveal } : {}) };
}
function validWords(words) {
  return words === null || words && typeof words === 'object' && !Array.isArray(words)
    && Object.keys(words).length === content.slots.length
    && content.slots.every(s => s.options.some(o => o.id === words[s.id]));
}
function sameWords(a, b) { return a === null || b === null ? a === b : content.slots.every(s => a[s.id] === b[s.id]); }
export function fieldworkApi({ req, res, pathname, session, body, persist, send }) {
  if (req.method === 'POST' && (!body || typeof body !== 'object' || Array.isArray(body))) return send(res, 400, { error: '送信内容を確認できません。' });
  const saved = savedFor(session);
  if (req.method === 'GET' && pathname === '/api/fieldwork/state') return send(res, 200, fieldworkState(session));
  if (req.method !== 'POST') return send(res, 404, { error: '操作が見つかりません。' });
  if (pathname === '/api/fieldwork/inspect') {
    if (!content.scenes.some(s => s.id === body.sceneId)) return send(res, 400, { error: '調べる場所が見つかりません。' });
    if (!saved.inspected.includes(body.sceneId)) saved.inspected.push(body.sceneId);
  } else if (pathname === '/api/fieldwork/options') {
    saved.optionsOpened = true;
  } else if (pathname === '/api/fieldwork/answer') {
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.requestId) || !validWords(body.words)) return send(res, 400, { error: '二つの考察を選んでください。' });
    if (saved.answer) {
      if (saved.answer.requestId === body.requestId && sameWords(saved.answer.words, body.words)) return send(res, 200, fieldworkState(session));
      return send(res, 409, { error: 'この調査は答え合わせ済みです。', state: fieldworkState(session) });
    }
    if (!saved.optionsOpened) return send(res, 409, { error: '考察をまとめてから回答してください。' });
    const matched = content.slots.filter(s => body.words?.[s.id] === content.solution[s.id]).map(s => s.id);
    saved.answer = { words: body.words, matched, points: matched.reduce((sum, id) => sum + content.points[id], 0), requestId: body.requestId, answeredAt: new Date().toISOString() };
  } else if (pathname === '/api/fieldwork/reset') {
    if (body.confirm !== true) return send(res, 400, { error: 'やり直すには確認が必要です。' });
    session.fieldwork[FIELDWORK_VERSION] = { inspected: [], optionsOpened: false };
  } else return send(res, 404, { error: '操作が見つかりません。' });
  persist();
  return send(res, 200, fieldworkState(session));
}
