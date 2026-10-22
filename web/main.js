import { createAtlas } from './atlas.js';
import { mountResultShare } from './share.js';
import './style.css';

const app = document.querySelector('#app');
const words = {
  ja: { brand: '土着信仰調査室', sub: 'FIELDNOTES ATLAS', daily: '今日の調査', prototype: '試作版：同じ5問を日替わりで並べ替えます。事実・座標・翻訳は公開前の照合待ちです。無料／有料の切替はデモで、決済はありません。', free: '無料モード', premium: '有料デモ', plan: '体験するプラン', clue: '手がかり', extra: '追加の手がかり', used: '追加ヒント使用', map: 'この場所は、どこだ？', answer: '地球儀をタップすると回答が確定します', result: '調査結果', correct: '正解', yours: 'あなたの地点', distance: '正解までの距離', pts: '獲得点', story: 'この場所の物語', sources: '資料を確認', pending: '出典・座標は照合待ち', next: '次の場所を調査', finish: '今日の結果を見る', reset: '地球全体へ', ad: '広告掲載予定エリア', adNote: '無料モードのみ。実際の広告は表示していません。', complete: '今日の調査を記録しました。', note: '追加ヒントの使用を記録しています。試作版にはランキング・課金はありません。', loading: '調査記録を読み込み中…', error: '接続できませんでした。ページを再読み込みしてください。', tap: '1本指で回す · 2本指で拡大 · タップで回答', center: '中央を回答する', mapLoading: '地図を読み込み中', imageryError: '衛星写真を取得できません。地図表示で続けられます。', mapError: '地図の読み込みに失敗しました。通信を確認し、再試行してください。', retry: '再試行', settings: '表示設定・試作について', detail: '街や島まで拡大できます', field: '地球を回して手がかりを探す' },
  en: { brand: 'Fieldnotes Atlas', sub: 'SACRED PLACES · WORLD EXPLORATION', daily: 'Daily expedition', prototype: 'Prototype: the same five places rotate daily. Facts, coordinates and translations await review. The plan switch is a demo; no payment is collected.', free: 'Free mode', premium: 'Premium demo', plan: 'Try a plan', clue: 'The clue', extra: 'Reveal another clue', used: 'Extra clue used', map: 'Where in the world?', answer: 'Tap the globe to lock in your answer', result: 'Your finding', correct: 'Answer', yours: 'Your pin', distance: 'Distance from the answer', pts: 'Points earned', story: 'The story of this place', sources: 'View sources', pending: 'Sources & coordinates await review', next: 'Explore the next place', finish: "See today's results", reset: 'Show the globe', ad: 'Reserved ad placement', adNote: 'Free mode only. No live ad is served.', complete: 'Your expedition is recorded.', note: 'Extra clue use is recorded. This prototype has no ranking or billing.', loading: 'Opening your fieldnotes…', error: 'Unable to connect. Please reload this page.', tap: 'Drag to turn · Pinch to zoom · Tap to answer', center: 'Answer at map center', mapLoading: 'Loading map', imageryError: 'Satellite imagery is unavailable. You can continue on the map.', mapError: 'Map could not load. Check your connection and retry.', retry: 'Retry', settings: 'Display settings & prototype information', detail: 'Zoom in to streets and islands', field: 'Turn the world. Follow the clues.' }
};
Object.assign(words.ja, { shareTitle: '今日の結果を投稿', share: '画像つきで共有', save: '画像を保存', copy: '投稿文をコピー', post: '投稿文を見る', shareAlt: '日付、合計点、5問の得点、追加ヒントの使用状況を記した共有画像' });
Object.assign(words.en, { shareTitle: 'Share your expedition', share: 'Share with image', save: 'Save image', copy: 'Copy post text', post: 'View post text', shareAlt: 'Share image with date, total score, five question scores and extra hint use' });
let locale = localStorage.getItem('fieldnotes-locale') === 'en' ? 'en' : 'ja';
let state;
let uiIndex;
let selected;
let atlas;
let view;
let toastTimer;
let submitting = false;
let disposeShare;
const t = key => words[locale][key];
const localized = value => value?.[locale] || '';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const compass = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="m26 11-3 12-9 6 3-12 9-6Z"/><path d="m17 17 6 6M20 1v5m0 28v5M1 20h5m28 0h5"/></svg>';
const api = async (route, body) => {
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};
function currentIndex() { const firstOpen = state.questions.findIndex(q => !q.answer); return firstOpen < 0 ? 4 : firstOpen; }
function adSlot() { return `<div class="ad-slot"><span>${t('ad')}</span><small>${t('adNote')}</small></div>`; }
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function clueMarkup(question) {
  return `<div class="clue-title"><span>FIELD NOTE / 0${uiIndex + 1}</span><span>${question.answer ? t('result') : t('clue')}</span></div><h1>${question.answer ? escapeHtml(localized(question.title)) : t('map')}</h1><p class="clue-text">${escapeHtml(localized(question.hint))}</p>${question.extraHint ? `<p class="extra-clue"><span>✦ ${t('used')}</span>${escapeHtml(localized(question.extraHint))}</p>` : !question.answer && state.plan === 'premium' ? `<button class="hint-button" id="extra-hint">✦ ${t('extra')}</button>` : ''}`;
}
function resultMarkup(question) {
  const result = question.answer;
  return `<div class="result-stats"><div><strong>${result.distanceKm.toLocaleString()}<small> km</small></strong><span>${t('distance')}</span></div><div><strong>${result.points}<small> / ${question.maxPoints}</small></strong><span>${t('pts')}</span></div></div><div class="focus-controls"><button id="focus-guess"><span class="dot amber"></span>${t('yours')}</button><button id="focus-answer"><span class="dot mint"></span>${t('correct')}</button></div><section class="story"><h2>${t('story')}</h2><p>${escapeHtml(localized(question.fact))}</p><details class="sources"><summary>${t('sources')} ↗</summary><p>${t('pending')}</p><ul>${question.sources.map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)} ↗</a></li>`).join('')}</ul></details></section>${state.plan === 'free' && uiIndex === 2 ? adSlot() : ''}`;
}
function mapMarkup(question) {
  return `<section class="atlas-stage" aria-label="${t('field')}"><div id="atlas"></div><div class="map-heading"><span class="live-dot"></span><span id="map-level">WORLD EXPLORATION</span><small>${t('detail')}</small></div><div class="map-status" id="map-status"><span class="spinner"></span>${t('mapLoading')}</div><div class="map-error" id="map-error" hidden><p>${t('mapError')}</p><button id="retry-map">${t('retry')}</button></div><div class="imagery-warning" id="imagery-warning" hidden>${t('imageryError')}</div><div class="map-controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset-map" aria-label="${t('reset')}" title="${t('reset')}">◎</button></div><div class="gesture-guide">${t('tap')}</div>${!question.answer ? `<button class="center-pin" id="center-pin">⌖ ${t('center')}</button>` : ''}</section>`;
}
function renderQuestion(question) {
  return `<div class="game-board ${question.answer ? 'revealed' : ''}">${mapMarkup(question)}<aside class="field-panel"><div class="panel-content">${clueMarkup(question)}${question.answer ? resultMarkup(question) : ''}</div><div class="answer-dock">${!question.answer ? `<div class="tap-callout" id="tap-callout">⌖ ${t('answer')}</div>` : `<button class="primary" id="next"><span>${uiIndex === 4 ? t('finish') : t('next')}</span><span>→</span></button>`}</div></aside></div>`;
}
function renderSummary() {
  return `<section class="summary"><div class="summary-symbol">${compass}</div><div class="eyebrow">EXPEDITION COMPLETE · ${state.day}</div><h1>${t('complete')}</h1><div class="big-score">${state.total}<span> / 1,000</span></div><p>${t('note')}</p><section class="share-panel" aria-labelledby="share-title"><h2 id="share-title">${t('shareTitle')}</h2><img id="share-preview" alt="${t('shareAlt')}" width="1200" height="1200" hidden><button class="primary" id="share-result" disabled>${t('share')}</button><div class="share-actions"><button id="save-result" disabled>${t('save')}</button><button id="copy-result">${t('copy')}</button></div><p id="share-status" role="status" aria-live="polite"></p><details class="share-post"><summary>${t('post')}</summary><textarea id="share-text" aria-label="${t('post')}" readonly rows="7"></textarea></details></section><div class="summary-list">${state.questions.map((q, i) => `<button class="summary-row" data-index="${i}"><span class="summary-number">0${i + 1}</span><span>${escapeHtml(localized(q.title))}${q.answer.usedHint ? `<small>✦ ${t('used')}</small>` : ''}</span><strong>${q.answer.points}<small> / ${q.maxPoints}</small></strong><span>↗</span></button>`).join('')}</div>${state.plan === 'free' ? adSlot() : ''}</section>`;
}
function render() {
  if (!state) { app.innerHTML = `<p class="loading">${t('loading')}</p>`; return; }
  disposeShare?.(); disposeShare = null;
  submitting = false;
  if (atlas) { view = atlas.getView(); atlas.destroy(); atlas = null; }
  document.documentElement.lang = locale;
  const summary = uiIndex === 5;
  app.innerHTML = `<div class="game-app"><header class="app-header"><div class="brand"><span class="brand-mark">${compass}</span><div><strong>${t('brand')}</strong><small>${t('sub')}</small></div></div><div class="header-actions"><button id="locale" class="text-button">${locale === 'ja' ? 'EN' : '日本語'}</button><details class="settings"><summary aria-label="${t('settings')}">☷</summary><div class="settings-panel"><label>${t('plan')}<select id="plan"><option value="free" ${state.plan === 'free' ? 'selected' : ''}>${t('free')}</option><option value="premium" ${state.plan === 'premium' ? 'selected' : ''}>${t('premium')}</option></select></label><p>${t('prototype')}</p><span>GLOBE PREVIEW · v0.2</span></div></details></div></header><main class="play-area"><div class="round-bar"><div class="round-heading"><span>${t('daily')}</span><small>${state.day} · JST</small></div><nav class="progress" aria-label="Round progress">${state.questions.map((q, i) => `<button class="step ${i === uiIndex ? 'current' : ''} ${q.answer ? 'done' : ''}" data-step="${i}" ${!q.answer && i !== currentIndex() ? 'disabled' : ''} aria-label="Question ${i + 1}"><span>${q.answer ? '✓' : `0${i + 1}`}</span><small>${q.maxPoints}</small></button>`).join('')}</nav><div class="score-total"><span>SCORE</span><strong>${state.total}<small> / 1000</small></strong></div></div>${summary ? renderSummary() : renderQuestion(state.questions[uiIndex])}</main><div id="toast" role="alert" hidden></div></div>`;
  bind();
}
function goTo(index) {
  // Dispose before dropping the old view, so a new question starts at the globe.
  if (atlas) { atlas.destroy(); atlas = null; }
  uiIndex = index; selected = null; submitting = false; view = null; render();
  window.scrollTo({ top: 0 });
}
function bind() {
  document.querySelector('#locale').onclick = () => { locale = locale === 'ja' ? 'en' : 'ja'; localStorage.setItem('fieldnotes-locale', locale); render(); };
  document.querySelector('#plan').onchange = async event => { try { state = await api('/api/demo-plan', { plan: event.target.value }); render(); } catch (error) { notify(error.message); } };
  document.querySelectorAll('[data-step], [data-index]').forEach(button => button.onclick = () => goTo(Number(button.dataset.step ?? button.dataset.index)));
  if (uiIndex === 5) {
    disposeShare = mountResultShare({ state, locale, url: new URL('/', location.href).href });
    return;
  }
  const question = state.questions[uiIndex];
  atlas = createAtlas({
    container: document.querySelector('#atlas'), locale, view,
    guess: question.answer?.guess || selected, correct: question.answer && question.coordinate, readOnly: !!question.answer,
    async onSelect(coord) {
      if (submitting) return;
      submitting = true;
      selected = coord;
      document.querySelector('#tap-callout').classList.add('is-submitting');
      try { state = await api('/api/answer', { questionId: question.id, lat: coord[0], lng: coord[1] }); render(); }
      catch (error) {
        notify(error.message);
        try { state = await api('/api/state'); render(); }
        catch { submitting = false; document.querySelector('#tap-callout')?.classList.remove('is-submitting'); }
      }
    },
    onStatus(status) {
      document.querySelector('#map-status').hidden = status !== 'loading';
      document.querySelector('#map-error').hidden = status !== 'error';
      if (status === 'imagery-error') document.querySelector('#imagery-warning').hidden = false;
    },
    onView(zoom) { document.querySelector('#map-level').textContent = zoom < 3 ? 'WORLD EXPLORATION' : zoom < 9 ? 'REGIONAL SURVEY' : 'LOCAL EXPLORATION'; }
  });
  document.querySelector('#zoom-in').onclick = () => atlas?.zoomIn?.();
  document.querySelector('#zoom-out').onclick = () => atlas?.zoomOut?.();
  document.querySelector('#reset-map').onclick = () => atlas?.reset?.();
  document.querySelector('#retry-map').onclick = () => render();
  const center = document.querySelector('#center-pin');
  if (center) center.onclick = () => atlas?.centerPin?.();
  document.querySelector('#focus-guess')?.addEventListener('click', () => atlas?.focus?.(question.answer.guess));
  document.querySelector('#focus-answer')?.addEventListener('click', () => atlas?.focus?.(question.coordinate));
  document.querySelector('#extra-hint')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { state = await api('/api/hint', { questionId: question.id }); render(); } catch (error) { notify(error.message); event.currentTarget.disabled = false; }
  });
  document.querySelector('#next')?.addEventListener('click', () => goTo(uiIndex === 4 ? 5 : uiIndex + 1));
}
try { state = await api('/api/state'); uiIndex = state.completed ? 5 : currentIndex(); render(); }
catch (error) { app.innerHTML = `<p class="loading">${t('error')}</p>`; console.error(error); }
