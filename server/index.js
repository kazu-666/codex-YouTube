import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dailyKey, roundFor, distanceKm, score, publicQuestion, revealedQuestion, POINTS } from './game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.FIELDNOTES_DATA_DIR || path.join(root, '.data');
const dataFile = path.join(dataDir, 'sessions.json');
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
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
function dayFor(session, day) {
  if (!session.days[day]) session.days[day] = { answers: {}, hints: {} };
  return session.days[day];
}
function state(session) {
  const day = dailyKey();
  const round = roundFor(day);
  const saved = dayFor(session, day);
  const questions = round.map((q, index) => saved.answers[q.id]
    ? revealedQuestion(q, index, saved.answers[q.id])
    : publicQuestion(q, index, saved.hints[q.id]));
  return { day, timeZone: 'Asia/Tokyo', plan: session.plan, demo: true, questions, completed: Object.keys(saved.answers).length === round.length, total: Object.values(saved.answers).reduce((sum, x) => sum + x.points, 0), maxTotal: POINTS.reduce((a, b) => a + b, 0) };
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
  if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, state(session));
  if (pathname === '/api/demo-plan' && req.method === 'POST') {
    const { plan } = await readJson(req);
    if (!['free', 'premium'].includes(plan)) return send(res, 400, { error: 'Invalid plan' });
    session.plan = plan;
    persist();
    return send(res, 200, state(session));
  }
  const day = dailyKey();
  const round = roundFor(day);
  const saved = dayFor(session, day);
  if (pathname === '/api/hint' && req.method === 'POST') {
    const { questionId } = await readJson(req);
    const q = round.find(item => item.id === questionId);
    if (!q) return send(res, 400, { error: 'Invalid question' });
    if (session.plan !== 'premium') return send(res, 403, { error: 'Premium demo required' });
    if (saved.answers[q.id]) return send(res, 409, { error: 'Already answered' });
    if (round.find(item => !saved.answers[item.id])?.id !== q.id) return send(res, 409, { error: 'Not current question' });
    saved.hints[q.id] = true;
    persist();
    return send(res, 200, state(session));
  }
  if (pathname === '/api/answer' && req.method === 'POST') {
    const { questionId, lat, lng } = await readJson(req);
    const index = round.findIndex(item => item.id === questionId);
    if (index < 0 || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return send(res, 400, { error: 'Invalid answer' });
    const q = round[index];
    if (saved.answers[q.id]) return send(res, 409, { error: 'Already answered', state: state(session) });
    if (round.find(item => !saved.answers[item.id])?.id !== q.id) return send(res, 409, { error: 'Not current question' });
    const distance = distanceKm([lat, lng], q.coordinate);
    saved.answers[q.id] = { guess: [lat, lng], distanceKm: Math.round(distance), points: score(distance, index), usedHint: !!saved.hints[q.id] };
    persist();
    return send(res, 200, state(session));
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
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'Request too large') return send(res, 400, { error: 'Invalid request' });
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});
server.listen(port, () => console.log(`Game running on http://localhost:${port}`));
