import questions from '../content/questions.json' with { type: 'json' };

export const POINTS = [100, 150, 200, 250, 300];
export const MAX_DISTANCE_KM = 20015;
export const CONTENT_VERSION = 'japan-stories-v1';
export const ROUND_IDS = ['first', 'second'];
export const ROUND_LABELS = { first: { ja: '巻一', en: 'Volume I' }, second: { ja: '巻二', en: 'Volume II' } };

export function dailyKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function defaultRound(day) {
  return ROUND_IDS[Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000) % ROUND_IDS.length];
}

export function roundFor(day, roundId = defaultRound(day)) {
  if (!ROUND_IDS.includes(roundId)) throw new Error('Invalid round');
  const offset = ROUND_IDS.indexOf(roundId) * 5;
  return questions.slice(offset, offset + 5);
}

export function distanceKm(from, to) {
  const rad = Math.PI / 180;
  const [aLat, aLng] = from.map(n => n * rad);
  const [bLat, bLng] = to.map(n => n * rad);
  const x = Math.sin((bLat - aLat) / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin((bLng - aLng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

// A shared 1 km full-score radius avoids penalising different points in a precinct.
// Japan-scale falloff: a roughly located region still earns points, precision matters.
export function score(distance, index) {
  return Math.round(POINTS[index] * Math.exp(-Math.max(0, distance - 1) / 250));
}

export function publicQuestion(q, index, usedHint) {
  return { id: q.id, number: index + 1, maxPoints: POINTS[index], category: q.category, hook: { ja: q.ja.hook, en: q.en.hook }, hint: { ja: q.ja.hint, en: q.en.hint }, extraHint: usedHint ? { ja: q.ja.extraHint, en: q.en.extraHint } : null, usedHint: !!usedHint };
}

export function revealedQuestion(q, index, answer) {
  return { ...publicQuestion(q, index, answer.usedHint), answer, coordinate: q.coordinate, title: { ja: q.ja.title, en: q.en.title }, fact: { ja: q.ja.fact, en: q.en.fact }, region: q.region, sources: q.sources, status: q.status };
}
