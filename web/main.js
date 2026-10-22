import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import './style.css';

const app = document.querySelector('#app');
const projection = geoMercator().scale(158).translate([500, 275]);
const path = geoPath(projection);
const land = feature(world, world.objects.countries);
const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
const graticule = geoGraticule10();
const words = {
  ja: { brand: '土着信仰調査室', sub: 'FIELDNOTES ATLAS / 地理クイズ', daily: '今日の調査', prototype: '試作版：5問を日替わりで並べ替えています。出典と座標は公開前の確認待ちです。', free: '無料', premium: '有料デモ', plan: '表示モード', clue: '手がかり', extra: '追加の手がかりを開く', used: '追加ヒント使用', map: '地図上で場所を選んでください', answer: 'この場所で回答する', selected: '選択地点', result: '調査結果', correct: '正解', distance: '正解まで', pts: '獲得点', story: '場所の話', sources: '資料・確認状況', pending: '公開前の照合待ち', next: '次の場所へ', finish: '今日の結果へ', reset: '全体表示', ad: '広告掲載予定エリア', adNote: '無料モードのみ。実際の広告は表示していません。', complete: '本日の調査、完了。', total: '合計点', max: '最高 1,000 点', note: '試作版ではランキング・課金はありません。', review: '各問の資料を確認する', loading: '読み込み中…', error: '通信エラー。再読み込みしてください。', round: '問', future: '今日の次の問題です', tap: 'タップで地点を指定。拡大して細かく選べます。' },
  en: { brand: 'Fieldnotes Atlas', sub: 'GEOGRAPHY QUIZ / FIELD NOTES', daily: "Today's expedition", prototype: 'Prototype: the same five places rotate daily. Sources and coordinates await pre-publication review.', free: 'Free', premium: 'Premium demo', plan: 'Display mode', clue: 'Clue', extra: 'Reveal extra clue', used: 'Extra clue used', map: 'Choose a place on the map', answer: 'Lock in this location', selected: 'Selected location', result: 'Your finding', correct: 'Answer', distance: 'Distance away', pts: 'Points', story: 'The story', sources: 'Sources & review status', pending: 'Pending publication review', next: 'Next place', finish: "Today's results", reset: 'Show whole world', ad: 'Reserved ad placement', adNote: 'Free mode only. No live ad is served.', complete: 'Expedition complete.', total: 'Total score', max: 'Maximum 1,000', note: 'This prototype has no ranking or billing.', review: 'Review sources for each place', loading: 'Loading…', error: 'Connection error. Please reload.', round: 'Q', future: 'The next question is here', tap: 'Tap to mark a place. Zoom in for precision.' }
};
let locale = localStorage.getItem('fieldnotes-locale') === 'en' ? 'en' : 'ja';
let state;
let uiIndex;
let selected;
let box = { x: 0, y: 0, w: 1000, h: 550 };
const t = key => words[locale][key];
const localized = value => value?.[locale] || '';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const api = async (route, body) => {
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};
function currentIndex() {
  const firstOpen = state.questions.findIndex(q => !q.answer);
  return firstOpen < 0 ? 4 : firstOpen;
}
function marker(coord, klass, label) {
  if (!coord) return '';
  const [x, y] = projection([coord[1], coord[0]]);
  return `<g class="${klass}" transform="translate(${x} ${y})"><circle r="11"/><circle r="4"/><text x="15" y="-13">${escapeHtml(label)}</text></g>`;
}
function adSlot() { return `<div class="ad-slot" aria-label="${t('ad')}"><span>${t('ad')}</span><small>${t('adNote')}</small></div>`; }
function mapMarkup(question) {
  const answer = question.answer;
  const guess = answer?.guess || selected;
  const solution = answer && question.coordinate;
  const line = guess && solution ? `<path class="measure-line" d="M${projection([guess[1], guess[0]]).join(' ')}L${projection([solution[1], solution[0]]).join(' ')}"/>` : '';
  return `<div class="map-shell"><div class="map-top"><span>${t('map')}</span><span class="map-hint">${t('tap')}</span></div><svg id="map" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="img" aria-label="Interactive world map"><rect class="ocean" x="0" y="0" width="1000" height="550"/><path class="graticule" d="${path(graticule)}"/><path class="land" d="${path(land)}"/><path class="borders" d="${path(borders)}"/>${line}${marker(guess, 'guess-marker', locale === 'ja' ? 'あなた' : 'You')}${marker(solution, 'answer-marker', locale === 'ja' ? '正解' : 'Answer')}</svg><div class="map-controls"><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="zoom-out" aria-label="Zoom out">−</button><button type="button" id="reset-map">${t('reset')}</button></div></div>`;
}
function renderQuestion(question) {
  const index = uiIndex;
  const isRevealed = !!question.answer;
  const result = question.answer;
  return `<section class="game-grid"><div class="prompt-pane"><div class="eyebrow">${t('daily')} / ${t('round')} ${index + 1} <span class="points-badge">${question.maxPoints} PTS</span></div><h1>${isRevealed ? escapeHtml(localized(question.title)) : t('map')}</h1><div class="clue-card"><span class="clue-label">01 / ${t('clue')}</span><p>${escapeHtml(localized(question.hint))}</p></div>${question.extraHint ? `<div class="extra-card"><span class="clue-label">02 / ${t('used')}</span><p>${escapeHtml(localized(question.extraHint))}</p></div>` : !isRevealed && state.plan === 'premium' ? `<button class="hint-button" id="extra-hint">✦ ${t('extra')}</button>` : ''}${isRevealed ? `<div class="result-card"><div class="result-head">${t('result')}</div><div class="result-stats"><div><strong>${result.distanceKm.toLocaleString()} <small>km</small></strong><span>${t('distance')}</span></div><div><strong>${result.points} <small>/ ${question.maxPoints}</small></strong><span>${t('pts')}</span></div></div><p class="correct-name">${t('correct')} · ${escapeHtml(localized(question.title))}</p><p class="story-label">${t('story')}</p><p class="story-text">${escapeHtml(localized(question.fact))}</p><details class="sources"><summary>${t('sources')} · ${t('pending')}</summary><ul>${question.sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)} ↗</a></li>`).join('')}</ul></details></div>${state.plan === 'free' && index === 2 ? adSlot() : ''}<button class="primary" id="next">${index === 4 ? t('finish') : t('next')} →</button>` : `<p class="selection">${selected ? `${t('selected')}: ${selected[0].toFixed(3)}°, ${selected[1].toFixed(3)}°` : t('tap')}</p><button class="primary" id="submit-answer" ${selected ? '' : 'disabled'}>${t('answer')} →</button>`}</div><div class="map-pane">${mapMarkup(question)}</div></section>`;
}
function renderSummary() {
  return `<section class="summary"><div class="eyebrow">${t('daily')} / ${state.day}</div><h1>${t('complete')}</h1><div class="big-score">${state.total}<span> / 1,000</span></div><p>${t('note')}</p><div class="summary-list">${state.questions.map((q, i) => `<button class="summary-row" data-index="${i}"><span>0${i + 1} · ${escapeHtml(localized(q.title))}</span><strong>${q.answer.points} / ${q.maxPoints}</strong>${q.answer.usedHint ? `<small>✦ ${t('used')}</small>` : ''}</button>`).join('')}</div>${state.plan === 'free' ? adSlot() : ''}</section>`;
}
function render() {
  if (!state) { app.innerHTML = `<p class="loading">${t('loading')}</p>`; return; }
  document.documentElement.lang = locale;
  const summary = uiIndex === 5;
  const question = state.questions[uiIndex];
  app.innerHTML = `<div class="site"><header class="site-header"><div class="brand"><span class="brand-mark">✳</span><div><strong>${t('brand')}</strong><small>${t('sub')}</small></div></div><div class="header-actions"><button id="locale" class="text-button">${locale === 'ja' ? 'EN' : '日本語'}</button><label class="plan-select">${t('plan')} <select id="plan"><option value="free" ${state.plan === 'free' ? 'selected' : ''}>${t('free')}</option><option value="premium" ${state.plan === 'premium' ? 'selected' : ''}>${t('premium')}</option></select></label></div></header><main><div class="topline"><span>${state.day} · JST</span><span>${state.total} / 1000 PTS</span></div><div class="progress" aria-label="Round progress">${state.questions.map((q, i) => `<button class="step ${i === uiIndex ? 'current' : ''} ${q.answer ? 'done' : ''}" data-step="${i}" ${!q.answer && i !== currentIndex() ? 'disabled' : ''}>${i + 1}</button>`).join('')}</div><p class="prototype">ⓘ ${t('prototype')}</p>${summary ? renderSummary() : renderQuestion(question)}</main><footer>FIELDNOTES ATLAS · ${t('brand')}</footer></div>`;
  bind();
}
function setBox(next) { box = next; const svg = document.querySelector('#map'); if (svg) svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`); }
function zoom(multiplier) {
  const w = Math.max(90, Math.min(1000, box.w * multiplier));
  const h = w * .55;
  setBox({ x: Math.max(0, Math.min(1000 - w, box.x + (box.w - w) / 2)), y: Math.max(0, Math.min(550 - h, box.y + (box.h - h) / 2)), w, h });
}
function bindMap() {
  const svg = document.querySelector('#map');
  let down;
  svg.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, box: { ...box }, moved: false }; svg.setPointerCapture(event.pointerId); });
  svg.addEventListener('pointermove', event => {
    if (!down) return;
    const dx = event.clientX - down.x, dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) > 5) down.moved = true;
    if (!down.moved) return;
    const rect = svg.getBoundingClientRect();
    setBox({ ...box, x: Math.max(0, Math.min(1000 - box.w, down.box.x - dx / rect.width * down.box.w)), y: Math.max(0, Math.min(550 - box.h, down.box.y - dy / rect.height * down.box.h)) });
  });
  svg.addEventListener('pointerup', event => {
    if (!down) return;
    const wasDrag = down.moved;
    down = null;
    if (wasDrag || state.questions[uiIndex].answer) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg.getScreenCTM().inverse());
    const coordinate = projection.invert([local.x, local.y]);
    if (!coordinate || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return;
    selected = [Math.max(-85, Math.min(85, coordinate[1])), Math.max(-180, Math.min(180, coordinate[0]))];
    render();
  });
  document.querySelector('#zoom-in').onclick = () => zoom(.6);
  document.querySelector('#zoom-out').onclick = () => zoom(1 / .6);
  document.querySelector('#reset-map').onclick = () => setBox({ x: 0, y: 0, w: 1000, h: 550 });
}
function bind() {
  document.querySelector('#locale').onclick = () => { locale = locale === 'ja' ? 'en' : 'ja'; localStorage.setItem('fieldnotes-locale', locale); render(); };
  document.querySelector('#plan').onchange = async event => { try { state = await api('/api/demo-plan', { plan: event.target.value }); render(); } catch (error) { alert(error.message); render(); } };
  document.querySelectorAll('[data-step], [data-index]').forEach(button => button.onclick = () => { uiIndex = Number(button.dataset.step ?? button.dataset.index); selected = null; box = { x: 0, y: 0, w: 1000, h: 550 }; render(); });
  if (uiIndex === 5) return;
  bindMap();
  const hint = document.querySelector('#extra-hint');
  if (hint) hint.onclick = async () => { try { state = await api('/api/hint', { questionId: state.questions[uiIndex].id }); render(); } catch (error) { alert(error.message); } };
  const answer = document.querySelector('#submit-answer');
  if (answer) answer.onclick = async () => { if (!selected) return; answer.disabled = true; try { state = await api('/api/answer', { questionId: state.questions[uiIndex].id, lat: selected[0], lng: selected[1] }); render(); } catch (error) { alert(error.message); state = await api('/api/state'); render(); } };
  const next = document.querySelector('#next');
  if (next) next.onclick = () => { uiIndex = uiIndex === 4 ? 5 : uiIndex + 1; selected = null; box = { x: 0, y: 0, w: 1000, h: 550 }; render(); };
}
try { state = await api('/api/state'); uiIndex = currentIndex(); render(); } catch (error) { app.innerHTML = `<p class="loading">${t('error')}</p>`; console.error(error); }
