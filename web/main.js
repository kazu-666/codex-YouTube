import { createAtlas } from './atlas.js';
import { mountResultShare } from './share.js';
import './style.css';

const app = document.querySelector('#app');
const words = {
  ja: {
    brand: 'ジオルーツ', sub: '土着信仰調査室', daily: '今日の探索', japan: '日本の怪異と伝説', preview: '体験版 · 全10問',
    prototype: '日本の怪異・伝説を探す体験版です。巻一・巻二の各5問を試せます。毎日新問を追加する版ではありません。伝承の一部、座標・翻訳は確認中です。有料切替と広告枠はデモで、決済や広告配信はありません。',
    free: '無料モード', premium: '有料デモ', plan: '体験するプラン', clue: '手がかり', extra: '追加の手がかり', used: '追加ヒント使用', map: 'この物語は、どこにある？',
    answer: 'この場所で回答する', select: '地図をタップしてピンを置く', selected: '選択中の地点', selectNote: 'ピンは動かせます。確定できるのは1回だけ。',
    result: '見つけた物語', correct: '正解の地点', yours: 'あなたの地点', distance: '正解までの距離', pts: '獲得点', story: 'この場所に、伝わること',
    sources: '出典と確認状況', pending: '体験版の原稿です。座標・翻訳を含め、正式公開前の最終確認は未完了です。', sourceRead: '本文を参照済み', sourcePending: '本文確認待ち',
    next: '次の物語へ', finish: '5問の結果を見る', reset: '日本全体へ', ad: '広告掲載予定エリア', adNote: '無料モードのみ。実際の広告は表示していません。',
    complete: '今日、5つの物語に出会った。', note: '追加ヒントの使用を記録しています。体験版にはランキング・課金はありません。',
    loading: '探索の準備をしています…', error: '接続できませんでした。ページを再読み込みしてください。', tap: '1本指で移動 · 2本指で拡大 · タップでピン', center: '中央にピンを置く',
    mapLoading: '地図を読み込み中', imageryError: '衛星写真を取得できません。地図表示で続けられます。', mapError: '地図を読み込めませんでした。通信を確認して再試行してください。', retry: '再試行',
    settings: '表示設定・体験版について', detail: '島・道路まで拡大して探そう', field: '地図で伝承の舞台を探す', measuring: '物語の舞台へ、追跡中。', skip: '演出をスキップ', replay: '線の演出をもう一度',
    perfect: 'ぴたり、たどり着いた。', near: 'すぐそこに、物語があった。', region: 'その地方に、気配あり。', far: '物語は、別の土地に。', radius: '正解から1km以内で満点',
    other: 'もう一つの巻を遊ぶ', photoNote: '現地写真は利用許諾の確認後に追加予定です。', shareTitle: 'この探索を、誰かにも。', share: '画像つきで共有', save: '画像を保存', copy: '投稿文をコピー', post: '投稿文を見る', shareAlt: '日付、巻、合計点、5問の得点、追加ヒント使用状況を記した共有画像',
  },
  en: {
    brand: 'GeoRoots', sub: 'FOLKLORE FIELDNOTES', daily: 'Today’s expedition', japan: 'Myths & mysteries of Japan', preview: 'Preview · 10 places',
    prototype: 'Explore two five-question volumes about Japan. This preview does not add new questions daily. Some stories, coordinates and translations await review. Plans and ad spaces are demos, with no billing or live ads.',
    free: 'Free mode', premium: 'Premium demo', plan: 'Try a plan', clue: 'The clue', extra: 'Reveal another clue', used: 'Extra clue used', map: 'Where does this story live?',
    answer: 'Lock in this location', select: 'Tap the map to place a pin', selected: 'Your provisional pin', selectNote: 'Move your pin freely. Lock in only once.',
    result: 'A story uncovered', correct: 'The answer', yours: 'Your pin', distance: 'Distance from the answer', pts: 'Points earned', story: 'What is told of this place',
    sources: 'Sources & review status', pending: 'Preview draft. Final review, including coordinates and translation, is still pending.', sourceRead: 'Source text consulted', sourcePending: 'Source text awaiting review',
    next: 'Explore the next story', finish: 'See all five results', reset: 'Show Japan', ad: 'Reserved ad placement', adNote: 'Free mode only. No live ad is served.',
    complete: 'Five places. Five stories uncovered.', note: 'Extra clue use is recorded. This preview has no ranking or billing.', loading: 'Preparing your expedition…', error: 'Unable to connect. Please reload this page.',
    tap: 'Drag to move · Pinch to zoom · Tap for a pin', center: 'Place pin at map centre', mapLoading: 'Loading map', imageryError: 'Satellite imagery is unavailable. Continue on the map.', mapError: 'Map could not load. Check your connection and retry.', retry: 'Retry',
    settings: 'Display settings & preview information', detail: 'Zoom into islands and streets', field: 'Find the places behind the stories', measuring: 'Tracing the story’s location…', skip: 'Skip animation', replay: 'Replay the route',
    perfect: 'You found the very place.', near: 'The story was just around the corner.', region: 'You picked up its trail.', far: 'This story lives elsewhere.', radius: 'Full points within 1 km',
    other: 'Explore the other volume', photoNote: 'Location photos will be added after licensing checks.', shareTitle: 'Pass the discovery on.', share: 'Share with image', save: 'Save image', copy: 'Copy post text', post: 'View post text', shareAlt: 'Share image with date, volume, total, five scores and hint use',
  }
};
let locale = localStorage.getItem('fieldnotes-locale') === 'en' ? 'en' : 'ja';
let state, uiIndex, selected, atlas, view, toastTimer, revealFallback, freshReveal;
let submitting = false, switching = false;
let disposeShare;
const t = key => words[locale][key];
const localized = value => value?.[locale] || '';
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const compass = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="m26 11-3 12-9 6 3-12 9-6Z"/><path d="m17 17 6 6M20 1v5m0 28v5M1 20h5m28 0h5"/></svg>';
const api = async (route, body) => {
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify({ ...body, roundId: state?.roundId }) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};
const stateRoute = id => `/api/state${id ? `?round=${encodeURIComponent(id)}` : ''}`;
const number = n => n.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: n < 10 ? 1 : 0 });
function currentIndex() { const first = state.questions.findIndex(q => !q.answer); return first < 0 ? 4 : first; }
function adSlot() { return `<div class="ad-slot"><span>${t('ad')}</span><small>${t('adNote')}</small></div>`; }
function notify(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function quality(q) { return q.answer.withinRadius ? 'perfect' : q.answer.points / q.maxPoints >= .8 ? 'near' : q.answer.points / q.maxPoints >= .35 ? 'region' : 'far'; }
function clueMarkup(q) {
  return `<div class="clue-title"><span>${esc(localized(q.category))}</span><span>CLUE / 0${uiIndex + 1}</span></div><h1>${esc(localized(q.hook))}</h1><p class="clue-text">${esc(localized(q.hint))}</p>${q.extraHint ? `<p class="extra-clue"><span>✦ ${t('used')}</span>${esc(localized(q.extraHint))}</p>` : state.plan === 'premium' ? `<button class="hint-button" id="extra-hint">✦ ${t('extra')}</button>` : ''}`;
}
function resultMarkup(q, animate) {
  const r = q.answer;
  return `<div class="clue-title"><span>${t('result')}</span><span>${esc(localized(q.region))}</span></div><h1 id="result-heading">${animate ? t('measuring') : esc(localized(q.title))}</h1><p class="result-reaction" id="result-reaction" ${animate ? 'hidden' : ''}>${t(quality(q))}</p><div class="result-stats" aria-live="off"><div><strong><span id="distance-number">${animate ? '0' : number(r.distanceKm)}</span><small> km</small></strong><span>${t('distance')}</span></div><div><strong><span id="points-number">${animate ? '0' : r.points}</span><small> / ${q.maxPoints}</small></strong><span>${t('pts')}</span></div></div><p id="result-announcement" class="sr-only" role="status" aria-live="polite"></p><div class="result-details" ${animate ? 'hidden' : ''}><div class="focus-controls"><button id="focus-guess"><span class="dot amber"></span>${t('yours')}</button><button id="focus-answer"><span class="dot mint"></span>${t('correct')}</button></div><section class="story"><span class="story-kicker">THE STORY BEHIND THE PLACE</span><h2>${esc(localized(q.hook))}</h2><p>${esc(localized(q.fact))}</p><details class="sources"><summary>${t('sources')} ↗</summary><p>${t('pending')}</p><ul>${q.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><small>${s.access === 'read' ? `${t('sourceRead')} · ${s.checkedAt}` : t('sourcePending')}</small></li>`).join('')}</ul></details><p class="photo-note">${t('photoNote')}</p></section>${state.plan === 'free' && uiIndex === 2 ? adSlot() : ''}</div>`;
}
function mapMarkup(q, animate) {
  return `<section class="atlas-stage" aria-label="${t('field')}"><div id="atlas"></div><div class="map-heading"><span class="live-dot"></span><span id="map-level">JAPAN EXPLORATION</span><small>${t('detail')}</small></div><div class="map-status" id="map-status"><span class="spinner"></span>${t('mapLoading')}</div><div class="map-error" id="map-error" hidden><p>${t('mapError')}</p><button id="retry-map">${t('retry')}</button></div><div class="imagery-warning" id="imagery-warning" hidden>${t('imageryError')}</div><div class="map-controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset-map" aria-label="${t('reset')}" title="${t('reset')}">◎</button></div>${q.answer ? `<div class="route-readout" id="route-readout"><span class="route-kicker">${animate ? 'TRACING THE DISTANCE' : 'STORY LOCATED'}</span><strong><span id="route-distance">${animate ? '0' : number(q.answer.distanceKm)}</span><small> km</small></strong><span class="route-meter"><i id="route-meter" style="transform:scaleX(${animate ? 0 : 1})"></i></span><button id="skip-reveal" ${animate ? '' : 'hidden'}>${t('skip')} ↠</button><button id="replay-reveal" ${animate ? 'hidden' : ''}>↻ ${t('replay')}</button></div>` : `<div class="gesture-guide">${t('tap')}</div><button class="center-pin" id="center-pin">⌖ ${t('center')}</button>`}</section>`;
}
function renderQuestion(q) {
  const animate = !!q.answer && freshReveal === q.id && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `<div class="game-board ${q.answer ? 'revealed' : ''}" data-phase="${animate ? 'travelling' : 'ready'}" data-quality="${q.answer ? quality(q) : ''}">${mapMarkup(q, animate)}<aside class="field-panel"><div class="panel-content">${q.answer ? resultMarkup(q, animate) : clueMarkup(q)}</div></aside><div class="answer-dock">${q.answer ? `<button class="primary" id="next" ${animate ? 'disabled' : ''}><span>${uiIndex === 4 ? t('finish') : t('next')}</span><span>→</span></button>` : `<div class="coordinate-readout"><span>${selected ? t('selected') : t('select')}</span><strong id="selected-coordinate">${selected ? `${selected[0].toFixed(4)}°, ${selected[1].toFixed(4)}°` : ''}</strong></div><button class="primary" id="lock-answer" ${selected ? '' : 'disabled'}><span>${t('answer')}</span><span>→</span></button><p class="answer-note">${t('selectNote')} ${t('radius')}</p>`}</div></div>`;
}
function renderSummary() {
  return `<section class="summary"><div class="summary-symbol">${compass}</div><div class="eyebrow">EXPEDITION COMPLETE · ${state.day} · ${esc(localized(state.roundLabel))}</div><h1>${t('complete')}</h1><div class="big-score">${state.total}<span> / 1,000</span></div><p>${t('note')}</p><section class="share-panel" aria-labelledby="share-title"><h2 id="share-title">${t('shareTitle')}</h2><img id="share-preview" alt="${t('shareAlt')}" width="1200" height="1200" hidden><button class="primary" id="share-result" disabled>${t('share')}</button><div class="share-actions"><button id="save-result" disabled>${t('save')}</button><button id="copy-result">${t('copy')}</button></div><p id="share-status" role="status" aria-live="polite"></p><details class="share-post"><summary>${t('post')}</summary><textarea id="share-text" aria-label="${t('post')}" readonly rows="7"></textarea></details></section><div class="summary-list">${state.questions.map((q, i) => `<button class="summary-row" data-index="${i}"><span class="summary-number">0${i + 1}</span><span>${esc(localized(q.title))}${q.answer.usedHint ? `<small>✦ ${t('used')}</small>` : ''}</span><strong>${q.answer.points}<small> / ${q.maxPoints}</small></strong><span>↗</span></button>`).join('')}</div><button class="other-round" id="other-round">${t('other')} →</button>${state.plan === 'free' ? adSlot() : ''}</section>`;
}
function cleanup() {
  clearTimeout(revealFallback);
  disposeShare?.(); disposeShare = null;
  if (atlas) { view = atlas.getView(); atlas.destroy(); atlas = null; }
}
function render() {
  if (!state) { app.innerHTML = `<p class="loading">${t('loading')}</p>`; return; }
  cleanup();
  submitting = false;
  document.documentElement.lang = locale;
  document.title = locale === 'ja' ? 'ジオルーツ｜日本の怪異と伝説を探す' : 'GeoRoots · Find Japan’s stories';
  app.innerHTML = `<div class="game-app"><header class="app-header"><div class="brand"><span class="brand-mark">${compass}</span><div><strong>${t('brand')}</strong><small>${t('sub')}</small></div></div><div class="header-actions"><button id="locale" class="text-button">${locale === 'ja' ? 'EN' : '日本語'}</button><details class="settings"><summary aria-label="${t('settings')}">☷</summary><div class="settings-panel"><label>${t('plan')}<select id="plan"><option value="free" ${state.plan === 'free' ? 'selected' : ''}>${t('free')}</option><option value="premium" ${state.plan === 'premium' ? 'selected' : ''}>${t('premium')}</option></select></label><p>${t('prototype')}</p><span>JAPAN STORIES · v0.3</span></div></details></div></header><main class="play-area"><div class="edition-bar"><div><span>${t('japan')}</span><small>${t('preview')}</small></div><nav class="round-picker" aria-label="${locale === 'ja' ? '体験する巻' : 'Choose a volume'}">${state.rounds.map(r => `<button data-round="${r.id}" aria-pressed="${state.roundId === r.id}">${esc(localized(r.label))}</button>`).join('')}</nav></div><div class="round-bar"><div class="round-heading"><span>${t('daily')}</span><small>${state.day} · JST</small></div><nav class="progress" aria-label="Round progress">${state.questions.map((q, i) => `<button class="step ${i === uiIndex ? 'current' : ''} ${q.answer ? 'done' : ''}" data-step="${i}" ${!q.answer && i !== currentIndex() ? 'disabled' : ''} aria-label="Question ${i + 1}"><span>${q.answer ? '✓' : `0${i + 1}`}</span><small>${q.maxPoints}</small></button>`).join('')}</nav><div class="score-total"><span>SCORE</span><strong>${state.total}<small> / 1000</small></strong></div></div>${uiIndex === 5 ? renderSummary() : renderQuestion(state.questions[uiIndex])}</main><div id="toast" role="alert" hidden></div></div>`;
  bind();
}
function goTo(index) {
  cleanup(); view = null; freshReveal = null; uiIndex = index; selected = null; render();
  window.scrollTo({ top: 0 });
}
async function switchRound(id) {
  if (switching || submitting || state.roundId === id) return;
  switching = true;
  document.querySelectorAll('[data-round], #other-round, #lock-answer, #plan').forEach(el => { el.disabled = true; });
  try {
    const next = await api(stateRoute(id));
    cleanup(); view = null; selected = null; freshReveal = null; state = next; uiIndex = state.completed ? 5 : currentIndex();
    history.replaceState(null, '', `?round=${id}`);
    render(); window.scrollTo({ top: 0 });
  } catch (error) { render(); notify(error.message); }
  finally { switching = false; }
}
async function lockAnswer(q) {
  if (!selected || submitting || switching) return;
  submitting = true;
  document.querySelector('#lock-answer').disabled = true;
  document.querySelectorAll('[data-round], [data-step], #locale, #plan, #extra-hint').forEach(el => { el.disabled = true; });
  try {
    state = await api('/api/answer', { questionId: q.id, lat: selected[0], lng: selected[1] });
    freshReveal = q.id; render();
  } catch (error) {
    try { state = await api(stateRoute(state.roundId)); } catch {}
    render(); notify(error.message);
  }
}
async function updateDemo(route, body) {
  if (submitting || switching) return;
  submitting = true;
  document.querySelectorAll('[data-round], [data-step], #locale, #plan, #extra-hint, #lock-answer').forEach(el => { el.disabled = true; });
  let failure;
  try { state = await api(route, body); freshReveal = null; }
  catch (error) { failure = error.message; }
  render();
  if (failure) notify(failure);
}
function bind() {
  document.querySelector('#locale').onclick = () => { locale = locale === 'ja' ? 'en' : 'ja'; localStorage.setItem('fieldnotes-locale', locale); freshReveal = null; render(); };
  document.querySelector('#plan').onchange = event => updateDemo('/api/demo-plan', { plan: event.target.value });
  document.querySelectorAll('[data-round]').forEach(button => button.onclick = () => switchRound(button.dataset.round));
  document.querySelectorAll('[data-step], [data-index]').forEach(button => button.onclick = () => { if (!submitting && !switching) goTo(Number(button.dataset.step ?? button.dataset.index)); });
  if (uiIndex === 5) {
    const shareUrl = new URL('/', location.href); shareUrl.searchParams.set('round', state.roundId);
    disposeShare = mountResultShare({ state, locale, url: shareUrl.href });
    document.querySelector('#other-round').onclick = () => switchRound(state.roundId === 'first' ? 'second' : 'first');
    return;
  }
  const q = state.questions[uiIndex];
  const animate = !!q.answer && freshReveal === q.id && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function reveal(progress, done) {
    if (!q.answer) return;
    const distance = number(q.answer.distanceKm * progress);
    document.querySelector('#distance-number').textContent = distance;
    document.querySelector('#route-distance').textContent = distance;
    document.querySelector('#points-number').textContent = done ? q.answer.points : '—';
    document.querySelector('#route-meter').style.transform = `scaleX(${progress})`;
    if (done) {
      clearTimeout(revealFallback); freshReveal = null;
      document.querySelector('.game-board').dataset.phase = 'ready';
      document.querySelector('#result-heading').textContent = localized(q.title);
      document.querySelector('#result-reaction').hidden = false;
      document.querySelector('.result-details').hidden = false;
      document.querySelector('#skip-reveal').hidden = true;
      document.querySelector('#replay-reveal').hidden = false;
      document.querySelector('.route-kicker').textContent = 'STORY LOCATED';
      document.querySelector('#next').disabled = false;
      document.querySelector('#result-announcement').textContent = `${localized(q.title)} · ${distance} km · ${q.answer.points} / ${q.maxPoints}`;
    }
  }
  atlas = createAtlas({
    container: document.querySelector('#atlas'), locale, view,
    guess: q.answer?.guess || selected, correct: q.answer && q.coordinate, readOnly: !!q.answer, animate,
    routeColor: q.answer && ['perfect', 'near'].includes(quality(q)) ? '#a1d8b9' : q.answer && quality(q) === 'far' ? '#d38b78' : '#e4b974',
    onReveal: reveal,
    onSelect(coord) {
      if (submitting || switching) return;
      selected = coord;
      document.querySelector('#selected-coordinate').textContent = `${coord[0].toFixed(4)}°, ${coord[1].toFixed(4)}°`;
      document.querySelector('.coordinate-readout > span').textContent = t('selected');
      document.querySelector('#lock-answer').disabled = false;
    },
    onStatus(status) {
      document.querySelector('#map-status').hidden = status !== 'loading';
      document.querySelector('#map-error').hidden = status !== 'error';
      if (status === 'imagery-error') document.querySelector('#imagery-warning').hidden = false;
    },
    onView(zoom) { document.querySelector('#map-level').textContent = zoom < 3 ? 'WORLD EXPLORATION' : zoom < 9 ? 'JAPAN EXPLORATION' : 'LOCAL EXPLORATION'; }
  });
  // A failed map must never keep a saved answer or the next button inaccessible.
  if (animate) revealFallback = setTimeout(() => { atlas?.skipReveal?.(); reveal(1, true); }, 7000);
  document.querySelector('#zoom-in').onclick = () => atlas?.zoomIn?.();
  document.querySelector('#zoom-out').onclick = () => atlas?.zoomOut?.();
  document.querySelector('#reset-map').onclick = () => atlas?.reset?.();
  document.querySelector('#retry-map').onclick = () => { freshReveal = null; render(); };
  document.querySelector('#center-pin')?.addEventListener('click', () => atlas?.centerPin?.());
  document.querySelector('#lock-answer')?.addEventListener('click', () => lockAnswer(q));
  document.querySelector('#focus-guess')?.addEventListener('click', () => atlas?.focus?.(q.answer.guess));
  document.querySelector('#focus-answer')?.addEventListener('click', () => atlas?.focus?.(q.coordinate));
  document.querySelector('#skip-reveal')?.addEventListener('click', () => { atlas?.skipReveal?.(); reveal(1, true); });
  document.querySelector('#replay-reveal')?.addEventListener('click', () => { freshReveal = q.id; render(); });
  document.querySelector('#extra-hint')?.addEventListener('click', () => updateDemo('/api/hint', { questionId: q.id }));
  document.querySelector('#next')?.addEventListener('click', () => goTo(uiIndex === 4 ? 5 : uiIndex + 1));
}
app.innerHTML = `<p class="loading">${t('loading')}</p>`;
try {
  const requested = new URL(location.href).searchParams.get('round');
  state = await api(stateRoute(['first', 'second'].includes(requested) ? requested : null));
  uiIndex = state.completed ? 5 : currentIndex(); render();
} catch (error) { app.innerHTML = `<p class="loading">${t('error')}</p>`; console.error(error); }
