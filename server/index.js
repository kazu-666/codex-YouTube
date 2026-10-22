import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dailyKey, defaultRound, roundFor, distanceKm, score, publicQuestion, revealedQuestion, POINTS, CONTENT_VERSION, ROUND_IDS, ROUND_LABELS, MAX_ATTEMPTS } from './game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.FIELDNOTES_DATA_DIR || path.join(root, '.data');
const dataFile = path.join(dataDir, 'sessions.json');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const evidenceCache = new Map();
const staticGzipCache = new Map();
fs.mkdirSync(dataDir, { recursive: true });
let sessions = {};
if (fs.existsSync(dataFile)) sessions = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

function persist() {
  const tmp = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions));
  fs.renameSync(tmp, dataFile);
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function sessionFor(req, res) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)geo_session=([0-9a-f-]{36})(?:;|$)/)?.[1];
  if (cookie && sessions[cookie]) return sessions[cookie];
  const id = crypto.randomUUID();
  sessions[id] = { id, plan: 'free', days: {} };
  res.setHeader('Set-Cookie', `geo_session=${id}; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`);
  persist();
  return sessions[id];
}
function dayFor(session, day, roundId) {
  const key = `${CONTENT_VERSION}:${day}:${roundId}`;
  if (!session.days[key]) session.days[key] = { answers: {}, hints: {}, attempts: {}, requests: {} };
  return session.days[key];
}
function state(session, roundId) {
  const day = dailyKey();
  roundId ||= defaultRound(day);
  const round = roundFor(day, roundId);
  const saved = dayFor(session, day, roundId);
  const questions = round.map((q, index) => saved.answers[q.id]
    ? revealedQuestion(q, index, saved.answers[q.id], saved.attempts[q.id] || [])
    : publicQuestion(q, index, saved.hints[q.id], saved.attempts[q.id] || []));
  return { day, roundId, roundLabel: ROUND_LABELS[roundId], dailyRoundId: defaultRound(day), rounds: ROUND_IDS.map(id => ({ id, label: ROUND_LABELS[id] })), contentVersion: CONTENT_VERSION, fullScoreRadiusKm: 1, timeZone: 'Asia/Tokyo', plan: session.plan, demo: true, questions, completed: Object.keys(saved.answers).length === round.length, total: Object.values(saved.answers).reduce((sum, x) => sum + x.points, 0), maxTotal: POINTS.reduce((a, b) => a + b, 0) };
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('Request too large');
  }
  return JSON.parse(raw || '{}');
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  return new URL(origin).host === host;
}
async function api(req, res, pathname) {
  if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Invalid origin' });
  const session = sessionFor(req, res);
  const body = req.method === 'POST' ? await readJson(req) : {};
  const roundId = body.roundId ?? new URL(req.url, 'http://localhost').searchParams.get('round') ?? defaultRound(dailyKey());
  if (!ROUND_IDS.includes(roundId)) return send(res, 400, { error: 'Invalid round' });
  if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, state(session, roundId));
  if (pathname === '/api/demo-plan' && req.method === 'POST') {
    const { plan } = body;
    if (!['free', 'premium'].includes(plan)) return send(res, 400, { error: 'Invalid plan' });
    session.plan = plan;
    persist();
    return send(res, 200, state(session, roundId));
  }
  const day = dailyKey();
  const round = roundFor(day, roundId);
  const saved = dayFor(session, day, roundId);
  const evidenceMatch = pathname.match(/^\/api\/evidence\/([a-f0-9]{6})\.(svg|jpg)$/);
  if (evidenceMatch && req.method === 'GET') {
    const q = round.find(item => item.id === evidenceMatch[1]);
    if (!q) return send(res, 404, { error: 'Not found' });
    const format = evidenceMatch[2];
    const file = path.join(root, 'content', 'evidence', `${q.id}.${format}`);
    if (!fs.existsSync(file)) return send(res, 404, { error: 'Evidence unavailable' });
    if (format === 'svg' && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      if (!evidenceCache.has(q.id)) evidenceCache.set(q.id, gzipSync(fs.readFileSync(file)));
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      return res.end(evidenceCache.get(q.id));
    }
    res.writeHead(200, { 'Content-Type': format === 'svg' ? 'image/svg+xml' : 'image/jpeg', 'Vary': 'Accept-Encoding', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(file).pipe(res);
  }
  function finish(q, index, reason) {
    const attempts = saved.attempts[q.id] || [];
    const best = attempts.reduce((a, b) => !a || b.rawDistance < a.rawDistance ? b : a, null);
    saved.answers[q.id] = { guess: best?.guess || null, distanceKm: best?.distanceKm ?? null, points: best ? score(best.rawDistance, index) : 0, usedHint: !!saved.hints[q.id], withinRadius: !!best && best.rawDistance <= 1, reason, attemptCount: attempts.length };
  }
  if (pathname === '/api/reveal' && req.method === 'POST') {
    const index = round.findIndex(q => q.id === body.questionId);
    if (index < 0) return send(res, 400, { error: 'Invalid question' });
    const q = round[index];
    if (saved.answers[q.id]) return send(res, 200, state(session, roundId));
    if (round.find(item => !saved.answers[item.id])?.id !== q.id) return send(res, 409, { error: 'Not current question' });
    finish(q, index, 'revealed'); persist();
    return send(res, 200, state(session, roundId));
  }
  if (pathname === '/api/hint' && req.method === 'POST') {
    const { questionId } = body;
    const q = round.find(item => item.id === questionId);
    if (!q) return send(res, 400, { error: 'Invalid question' });
    if (session.plan !== 'premium') return send(res, 403, { error: 'Premium demo required' });
    if (saved.answers[q.id]) return send(res, 409, { error: 'Already answered' });
    if (round.find(item => !saved.answers[item.id])?.id !== q.id) return send(res, 409, { error: 'Not current question' });
    saved.hints[q.id] = true;
    persist();
    return send(res, 200, state(session, roundId));
  }
  if (pathname === '/api/answer' && req.method === 'POST') {
    const { questionId, lat, lng, requestId, expectedAttempt } = body;
    const index = round.findIndex(item => item.id === questionId);
    if (index < 0 || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return send(res, 400, { error: 'Invalid answer' });
    const q = round[index];
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) return send(res, 400, { error: 'Invalid request ID' });
    if (saved.requests[requestId]) {
      if (saved.requests[requestId] !== q.id) return send(res, 409, { error: 'Request ID already used' });
      return send(res, 200, state(session, roundId));
    }
    if (saved.answers[q.id]) return send(res, 409, { error: 'Already answered', state: state(session, roundId) });
    if (round.find(item => !saved.answers[item.id])?.id !== q.id) return send(res, 409, { error: 'Not current question' });
    const attempts = saved.attempts[q.id] ||= [];
    if (expectedAttempt !== attempts.length || attempts.length >= MAX_ATTEMPTS) return send(res, 409, { error: 'Attempt already recorded', state: state(session, roundId) });
    const distance = distanceKm([lat, lng], q.coordinate);
    const latDelta = q.coordinate[0] - lat;
    const lngDelta = (q.coordinate[1] - lng) * Math.cos(lat * Math.PI / 180);
    const bearing = (Math.atan2(lngDelta, latDelta) * 180 / Math.PI + 360) % 360;
    attempts.push({ guess: [lat, lng], distanceKm: Math.round(distance * 10) / 10, rawDistance: distance, direction: Math.round(bearing / 45) % 8 });
    saved.requests[requestId] = q.id;
    if (distance <= 1 || attempts.length >= MAX_ATTEMPTS) finish(q, index, distance <= 1 ? 'located' : 'limit');
    persist();
    return send(res, 200, state(session, roundId));
  }
  return send(res, 404, { error: 'Not found' });
}

let vite;
if (!production) {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    // This deployment is a review prototype, not the public release.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/healthz' && req.method === 'GET') return send(res, 200, { status: 'ok' });
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    if (vite) return vite.middlewares(req, res, () => send(res, 404, { error: 'Not found' }));
    const file = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(path.join(root, 'dist') + path.sep) && file !== path.join(root, 'dist', 'index.html')) return send(res, 404, { error: 'Not found' });
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'dist', 'index.html');
    const headers = { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : /\/assets\//.test(target) ? 'public, max-age=31536000, immutable' : 'no-cache', 'Vary': 'Accept-Encoding' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && /\.(?:js|css|svg|json|html)$/.test(target)) {
      if (!staticGzipCache.has(target)) staticGzipCache.set(target, gzipSync(fs.readFileSync(target)));
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
      return res.end(staticGzipCache.get(target));
    }
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'Request too large') return send(res, 400, { error: 'Invalid request' });
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});
server.listen(port, () => console.log(`Game running on http://localhost:${port}`));
