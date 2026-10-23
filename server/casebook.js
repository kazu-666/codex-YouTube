import fs from 'node:fs';
import path from 'node:path';
import cases from '../content/deduction-cases.json' with { type: 'json' };

export const CASEBOOK_VERSION = 'deduction-demo-v1';

function bookFor(session) {
  session.casebooks ||= {};
  return session.casebooks[CASEBOOK_VERSION] ||= { entries: {}, requests: {} };
}
function entryFor(book, id) { return book.entries[id] ||= { opened: [], optionsOpened: false }; }
function nextIndex(book) { const i = cases.findIndex(c => !book.entries[c.id]?.recorded); return i < 0 ? cases.length : i; }

export function casebookState(session) {
  const book = bookFor(session), current = nextIndex(book);
  return {
    contentVersion: CASEBOOK_VERSION, demo: true, title: '異聞調査録', plan: session.plan,
    maxTotal: cases.reduce((n, c) => n + c.maxPoints, 0),
    total: Object.values(book.entries).reduce((n, e) => n + (e.answer?.points || 0), 0),
    currentIndex: current, completed: current === cases.length,
    cases: cases.map((c, i) => {
      const e = book.entries[c.id] || { opened: [], optionsOpened: false };
      const result = { id: c.id, number: i + 1, locked: i > current };
      if (result.locked) return result;
      Object.assign(result, { title: c.title, teaser: c.teaser, intro: c.intro, question: c.question,
        sceneUrl: c.sceneUrl, sceneAlt: c.sceneAlt, sceneNote: c.sceneNote, maxPoints: c.maxPoints,
        opened: e.opened, optionsOpened: e.optionsOpened,
        clues: c.clues.map(clue => e.opened.includes(clue.id) || e.answer ? clue : { id: clue.id, title: clue.title }) });
      if (e.optionsOpened || e.answer) result.report = c.report;
      if (e.answer) result.answer = { ...e.answer, solution: c.solution, explanation: c.explanation };
      if (e.recorded) {
        const { photoId, ...location } = c.location;
        Object.assign(result, { recorded: true, location: { ...location, photoUrl: `/api/casebook/photo/${c.id}.jpg` },
          sources: c.sources, sourceKind: c.sourceKind });
      }
      return result;
    }),
    collection: cases.filter(c => book.entries[c.id]?.recorded).map(c => ({
      id: c.id, title: c.title, prefecture: c.location.prefecture, area: c.location.area,
      place: c.location.place, position: c.location.position, points: book.entries[c.id].answer.points,
      correct: book.entries[c.id].answer.correct, openedCount: book.entries[c.id].opened.length,
    })),
  };
}

export function casebookApi({ req, res, pathname, session, body, root, persist, send }) {
  if (req.method === 'POST' && (!body || typeof body !== 'object' || Array.isArray(body))) return send(res, 400, { error: '送信内容を確認できません。' });
  const book = bookFor(session);
  if (req.method === 'GET' && pathname === '/api/casebook/state') return send(res, 200, casebookState(session));
  const photo = pathname.match(/^\/api\/casebook\/photo\/([a-f0-9]{6})\.jpg$/);
  if (req.method === 'GET' && photo) {
    const c = cases.find(c => c.id === photo[1]);
    if (!c) return send(res, 404, { error: '資料が見つかりません。' });
    if (!book.entries[c.id]?.recorded) return send(res, 403, { error: '土地の記録を開くと写真が見られます。' });
    const file = path.join(root, 'content', 'report-images', `${c.location.photoId}.jpg`);
    if (!fs.existsSync(file)) return send(res, 404, { error: '写真を取得できませんでした。' });
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method !== 'POST' || !['/api/casebook/evidence', '/api/casebook/options', '/api/casebook/answer', '/api/casebook/record'].includes(pathname)) return send(res, 404, { error: '操作が見つかりません。' });
  const index = cases.findIndex(c => c.id === body.caseId), c = cases[index];
  if (!c) return send(res, 400, { error: '問題が見つかりません。' });
  if (index > nextIndex(book)) return send(res, 409, { error: '今の調査を記録してから、次の話へ進めます。', state: casebookState(session) });
  const e = entryFor(book, c.id);
  if (pathname === '/api/casebook/evidence') {
    if (!c.clues.some(x => x.id === body.clueId)) return send(res, 400, { error: '手がかりが見つかりません。' });
    if (!e.answer && !e.opened.includes(body.clueId)) e.opened.push(body.clueId);
  }
  if (pathname === '/api/casebook/options') e.optionsOpened = true;
  if (pathname === '/api/casebook/answer') {
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(body.requestId)) return send(res, 400, { error: '送信を確認できません。もう一度お試しください。' });
    const previous = book.requests[body.requestId];
    if (previous) {
      const sameWords = previous.words === null ? body.words === null : body.words && !Array.isArray(body.words) && Object.keys(body.words).length === c.report.slots.length && c.report.slots.every(slot => previous.words[slot.id] === body.words[slot.id]);
      if (previous.caseId !== c.id || !sameWords) return send(res, 409, { error: '同じ送信番号で異なる回答は送れません。' });
      return send(res, 200, casebookState(session));
    }
    if (e.answer) return send(res, 409, { error: 'この調査の回答は確定しています。', state: casebookState(session) });
    const words = body.words;
    if (!e.optionsOpened || (words !== null && (!words || typeof words !== 'object' || Array.isArray(words) || Object.keys(words).length !== c.report.slots.length || !c.report.slots.every(slot => slot.options.some(option => option.id === words[slot.id]))))) return send(res, 400, { error: '報告書を開き、２つの空欄に言葉を入れてください。' });
    const matched = words === null ? 0 : c.report.slots.filter(slot => words[slot.id] === c.solution[slot.id]).length;
    e.answer = { words, matched, correct: matched === c.report.slots.length,
      points: Math.round(c.maxPoints * matched / c.report.slots.length), answeredAt: new Date().toISOString() };
    book.requests[body.requestId] = { caseId: c.id, words };
  }
  if (pathname === '/api/casebook/record') {
    if (!e.answer) return send(res, 409, { error: '考察の答え合わせをすると、土地を知ることができます。' });
    e.recorded = true;
  }
  persist();
  return send(res, 200, casebookState(session));
}
