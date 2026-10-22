import questions from '../content/questions.json' with { type: 'json' };

export const POINTS = [100, 150, 200, 250, 300];
export const MAX_DISTANCE_KM = 20015;

export function dailyKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function roundFor(day) {
  const n = [...day].reduce((acc, char) => acc + char.charCodeAt(0), 0) % questions.length;
  return [...questions.slice(n), ...questions.slice(0, n)];
}

export function distanceKm(from, to) {
  const rad = Math.PI / 180;
  const [aLat, aLng] = from.map(n => n * rad);
  const [bLat, bLng] = to.map(n => n * rad);
  const x = Math.sin((bLat - aLat) / 2) ** 2 + Math.cos(aLat) * Math.cos(bLat) * Math.sin((bLng - aLng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function score(distance, index) {
  return Math.round(POINTS[index] * Math.exp(-distance / 2000));
}

export function publicQuestion(q, index, usedHint) {
  return { id: q.id, number: index + 1, maxPoints: POINTS[index], hint: { ja: q.ja.hint, en: q.en.hint }, extraHint: usedHint ? { ja: q.ja.extraHint, en: q.en.extraHint } : null, usedHint: !!usedHint };
}

export function revealedQuestion(q, index, answer) {
  return { ...publicQuestion(q, index, answer.usedHint), answer, coordinate: q.coordinate, title: { ja: q.ja.title, en: q.en.title }, fact: { ja: q.ja.fact, en: q.en.fact }, sources: q.sources, status: q.status };
}
