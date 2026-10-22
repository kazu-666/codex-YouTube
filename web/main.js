import { createAtlas } from './atlas.js';
import { mountResultShare } from './share.js';
import { showDiscovery } from './discovery.js';
import './style.css';

const app = document.querySelector('#app');
const words = {
  ja: {
    brand: 'ジオルーツ', sub: '土着信仰調査室', daily: '今日の探索', japan: '日本の怪異と伝説', preview: '体験版 · 全10問',
    prototype: '日本列島を拡大した球体で怪異・伝説を探す体験版です。詳細表示は実座標の地図へ切り替わり、距離も実座標で採点します。巻一・巻二の各5問を試せます。毎日新問を追加する版ではありません。伝承の一部、座標・翻訳は確認中です。有料切替と広告枠はデモで、決済や広告配信はありません。',
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
    prototype: 'A Japan-sized game globe with a detailed real-world map when you zoom in. Distances use real coordinates. Explore two five-question volumes about Japan. This preview does not add new questions daily. Some stories, coordinates and translations await review. Plans and ad spaces are demos, with no billing or live ads.',
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
Object.assign(words.ja, {
  prototype: '実際の航空写真から現場を探す体験版。道路地図にも切替可能。各問3回まで照合でき、最も近い地点で採点します。1km以内で現場特定・満点。100km以内と20km以内で資料が開きます。「目的地を見る」でいつでも終了できます。巻一・巻二の固定10問です。座標・翻訳・一部の伝承は確認中。課金・広告配信はありません。',
  select: '資料の中心と同じ場所にピンを置こう', answer: 'この地点を照合する', mapLoading: '最初の地図を準備中…',
  mapError: '地図を取得できません。通信を確認して再試行してください。資料と調査記録は残っています。',
  measuring: '目的地へ、照合中。', correct: '目的地', complete: '5件の調査を終えました。',
  evidence: '現場資料', evidenceNote: '中央の十字が調査対象。北は上。地名は非表示です。',
  area: '調査地域へ', pin: 'ピンへ戻る', allJapan: '日本全体', investigate: '照合', giveUp: '目的地を見る・調査終了',
  records: '調査記録', unlocked: '資料を開封', scan: '現場と照合しています…', noPin: 'タップでピンを置く',
  best: '最接近', remaining: '残り', close: '閉じる', how: '遊び方',
  help: '①現場資料を開き、川・道・建物の形を覚える。②調査地域の地図を指で動かし、細部まで拡大して照合。③資料中央の十字と同じ地点へピンを置く。3回まで挑戦でき、最接近の距離で採点します。近づくと資料が開きます。目的地を見ると終了し、全解説が読めます。',
  stages: ['未特定', '広域一致', '周辺一致', '現場特定'],
  directions: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
  proximity: '現場の方向', locked1: '100km以内で地域メモが開く', locked2: '20km以内で曰くの断片が開く',
  offscreen: '選択ピンが画面外です', noAttempts: '照合なし', goal: '目的地を地図で見る',
  finalNote: '最も近かった照合地点で採点。全員が場所の物語を読めます。',
  endEarly: '途中で目的地を確認しました', attemptsEnd: '3回の照合が完了しました',
  tileError: '一部の地図を取得できません。表示済みの地図で続けるか、再試行できます。'
});
Object.assign(words.en, {
  prototype: 'Match a real aerial-image fragment to the map. Switch to the road map when needed. Up to three checks per place; the closest check determines your score. Full points within 1 km. Records open within 100 km and 20 km. Reveal destination to finish at any time. Two fixed five-place volumes. Some stories, coordinates and translations await review. No billing or live ads.',
  select: 'Match the crosshair in the site map', answer: 'Check this location', mapLoading: 'Preparing the first map…',
  measuring: 'Tracing the destination…', correct: 'Destination', complete: 'Five investigations completed.',
  evidence: 'Site map', evidenceNote: 'Find the centre crosshair. North is up. Place names are hidden.',
  area: 'Search area', pin: 'Back to pin', allJapan: 'All Japan', investigate: 'Check', giveUp: 'Reveal destination · end search',
  records: 'Field records', unlocked: 'Record unlocked', scan: 'Checking the site…', noPin: 'Tap to place a pin',
  best: 'Closest', remaining: 'Left', close: 'Close', how: 'How to play',
  help: '1. Open the site map and compare roads, rivers and buildings. 2. Drag and pinch the search map to find a match. 3. Place your pin at the site-map crosshair. You have three checks; your closest check determines the score. Records unlock as you approach. Reveal destination ends the search and opens the full story.',
  stages: ['Unlocated', 'Area matched', 'Nearby', 'Site located'], directions: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  proximity: 'Site direction', locked1: 'Within 100 km: regional note', locked2: 'Within 20 km: story fragment',
  offscreen: 'Your pin is off screen', noAttempts: 'No checks made', goal: 'Show destination on map',
  finalNote: 'Your closest checked location determines the score. Everyone can read the full story.',
  endEarly: 'Destination revealed early', attemptsEnd: 'All three checks completed',
  tileError: 'Some map tiles could not load. Continue with the visible map or retry.'
});
let locale = localStorage.getItem('fieldnotes-locale') === 'en' ? 'en' : 'ja';
let basemap = localStorage.getItem('georoots-basemap') === 'map' ? 'map' : 'satellite';
let state, uiIndex, selected, atlas, activeMapKey, disposeShare, freshReveal, toastTimer, revealFallback;
let freshUnlock = [];
let submitting = false, switching = false;
const t = key => words[locale][key];
const localized = value => value?.[locale] || '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const compass = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="17"/><path d="m26 11-3 12-9 6 3-12 9-6Z"/></svg>';
const number = n => n == null ? '—' : n.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: n < 10 ? 1 : 0 });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const api = async (route, body) => {
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify({ ...body, roundId: state?.roundId }) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};
const stateRoute = id => `/api/state${id ? `?round=${encodeURIComponent(id)}` : ''}`;
function currentIndex() { const i = state.questions.findIndex(q => !q.answer); return i < 0 ? 4 : i; }
function adSlot() { return `<div class="ad-slot"><span>${t('ad')}</span><small>${t('adNote')}</small></div>`; }
function notify(message) {
  const toast = document.querySelector('#toast'); if (!toast) return;
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function quality(q) { return q.answer.withinRadius ? 'perfect' : q.answer.points / q.maxPoints >= .8 ? 'near' : q.answer.points / q.maxPoints >= .35 ? 'region' : 'far'; }
function evidenceUrl(q) { return `${basemap === 'map' ? q.mapEvidenceUrl : q.evidenceUrl}?round=${state.roundId}`; }
function clueMarkup(q) {
  return `<section class="question-bar"><div class="score-total"><span>SCORE</span><strong>${String(state.total).padStart(3, '0')}</strong></div><div class="question-main"><div class="clue-strip"><span>${locale === 'ja' ? `調査 ${uiIndex + 1} / 5` : `Case ${uiIndex + 1} / 5`}</span><small>${esc(localized(state.roundLabel))} · ${q.maxPoints} ${locale === 'ja' ? '点' : 'pts'}</small></div><h1 class="clue-text" id="question-text">${esc(localized(q.area))}${locale === 'ja' ? '。' : ' · '}${locale === 'ja' ? '現場資料と同じ場所を探してください。' : 'Find the place shown in the site map.'}</h1></div></section>`;
}
function mapMarkup(q) {
  return `<section class="atlas-stage" aria-label="${t('field')}"><div id="atlas"></div><div class="evidence-preview"><button id="open-evidence" aria-haspopup="dialog"><span>${t('evidence')} ↗</span><img src="${evidenceUrl(q)}" alt="${t('evidenceNote')}" width="640" height="400"><small>${locale === 'ja' ? 'タップで資料を拡大' : 'Tap to inspect'}</small></button></div><div class="map-shortcuts"><button id="area-map">⌖ ${t('area')}</button><button id="return-pin" ${selected || q.answer?.guess ? '' : 'disabled'}>● ${t('pin')}</button></div><div class="pin-offscreen" id="pin-offscreen" hidden>${t('offscreen')}</div><div class="map-status" id="map-status"><span class="spinner"></span>${t('mapLoading')}</div><div class="map-error" id="map-error" hidden><p>${t('mapError')}</p><button id="retry-map">${t('retry')}</button></div><div class="tile-warning" id="tile-warning" hidden><span>${t('tileError')}</span><button id="retry-tiles">${t('retry')}</button></div><div class="scan-sweep" aria-hidden="true"></div><div class="scan-label" role="status" hidden>${t('scan')}</div><div class="basemap-switch" role="group" aria-label="${locale === 'ja' ? '地図の表示' : 'Map appearance'}"><button id="basemap-satellite" aria-pressed="${basemap === 'satellite'}">${locale === 'ja' ? '航空写真' : 'Satellite'}</button><button id="basemap-map" aria-pressed="${basemap === 'map'}">${locale === 'ja' ? '道路地図' : 'Map'}</button></div><div class="map-controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset-map" aria-label="${t('allJapan')}" title="${t('allJapan')}">◎</button></div></section>`;
}
function records(q) {
  const last = q.attempts.at(-1);
  return `<section class="investigation-records ${freshUnlock.length ? 'record-unlocked' : ''}" aria-label="${t('records')}"><div class="record-heading"><span class="stage-badge" data-stage="${q.stage}">${t('stages')[q.stage]}</span><span class="attempt-dots" aria-label="${q.attempts.length} / ${q.maxAttempts}">${Array.from({ length: q.maxAttempts }, (_, i) => `<i class="${i < q.attempts.length ? 'used' : ''}"></i>`).join('')} ${t('remaining')} ${q.maxAttempts - q.attempts.length}</span></div>${last ? `<p class="last-check" role="status">${t('investigate')} ${q.attempts.length}：<strong>${number(last.distanceKm)} km</strong> · ${t('proximity')} ${t('directions')[last.direction]}</p>` : ''}<div class="record-cards">${[1, 2].map(level => {
    const item = q.unlocked.find(r => r.level === level);
    return `<div class="record-card ${item ? 'open' : 'locked'} ${freshUnlock.includes(level) ? 'just-unlocked' : ''}"><span>${item ? '✦' : '◇'} ${level === 1 ? (locale === 'ja' ? '地域メモ' : 'Regional note') : (locale === 'ja' ? '曰くの断片' : 'Story fragment')}</span><p>${item ? esc(localized(item.text)) : t(level === 1 ? 'locked1' : 'locked2')}</p></div>`;
  }).join('')}</div>${q.extraHint ? `<p class="extra-clue"><span>✦ ${t('used')}</span>${esc(localized(q.extraHint))}</p>` : state.plan === 'premium' ? `<button class="hint-button" id="extra-hint">+ ${t('extra')}</button>` : ''}${q.attempts.length ? `<details class="attempt-history"><summary>${t('records')} · ${t('best')} ${number(Math.min(...q.attempts.map(a => a.distanceKm)))} km</summary>${q.attempts.map((a, i) => `<button data-attempt="${i}">${i + 1} · ${number(a.distanceKm)} km · ${t('pin')} ↗</button>`).join('')}</details>` : ''}${q.unlocked.length ? `<button class="review-discovery" id="review-discovery">✦ ${locale === 'ja' ? '見つかった手がかりを読む' : 'Read your discovered evidence'} ↗</button>` : ''}</section>`;
}
function resultMarkup(q, animate) {
  const r = q.answer;
  return `<section class="compact-result"><div class="result-stats"><span class="earned-points"><i class="dot ${r.withinRadius ? 'mint' : 'amber'}"></i><strong>+<span id="points-number">${animate ? '—' : r.points}</span></strong><small> / ${q.maxPoints}</small></span><span class="result-distance"><strong id="distance-number">${animate ? '0' : number(r.distanceKm)}</strong> km</span></div><div class="route-actions"><span id="reveal-status">${animate ? t('measuring') : r.withinRadius ? t('stages')[3] : t(r.reason === 'revealed' ? 'endEarly' : 'attemptsEnd')}</span><button id="skip-reveal" ${animate ? '' : 'hidden'}>${t('skip')} ↠</button><button id="replay-reveal" ${animate || !r.guess ? 'hidden' : ''}>↻ ${t('replay')}</button></div><p id="result-announcement" class="sr-only" role="status" aria-live="polite"></p><div class="result-details" ${animate ? 'hidden' : ''}><article class="answer-card"><span class="report-kicker">${locale === 'ja' ? '調査報告' : 'FIELD REPORT'}</span><h2 id="result-heading">${esc(localized(q.title))}</h2><p>${esc(localized(q.summary))}</p><div class="focus-controls"><button id="focus-answer"><i class="dot mint"></i>${t('goal')}</button>${r.guess ? `<button id="focus-guess"><i class="dot amber"></i>${t('yours')}</button>` : ''}</div><details class="sources"><summary>${locale === 'ja' ? '詳しい話・出典' : 'Full story & sources'}</summary><p>${esc(localized(q.fact))}</p><p class="review-note">${t('pending')}</p><ul>${q.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><small>${s.access === 'read' ? t('sourceRead') : t('sourcePending')}</small></li>`).join('')}</ul></details></article><p class="score-note">${t('finalNote')}</p>${state.plan === 'free' && uiIndex === 2 ? adSlot() : ''}</div><button class="primary" id="next" ${animate ? 'disabled' : ''}>${uiIndex === 4 ? t('finish') : t('next')} →</button></section>`;
}
function renderQuestion(q) {
  const animate = !!q.answer?.guess && freshReveal === q.id && !reduced();
  return `${clueMarkup(q)}<div class="game-board ${q.answer ? 'revealed' : ''}" data-phase="${animate ? 'travelling' : 'ready'}">${mapMarkup(q)}<div class="answer-dock">${q.answer ? resultMarkup(q, animate) : `<div class="pin-instructions"><span id="pin-instruction">${selected ? t('selected') : t('noPin')}</span><button id="center-pin" class="center-pin">⌖ ${t('center')}</button></div><button class="primary" id="lock-answer" ${selected ? '' : 'disabled'}>${t('answer')} →</button><button class="reveal-destination" id="reveal-destination">${t('giveUp')}</button>${records(q)}`}</div></div>`;
}
function renderSummary() {
  return `<section class="summary"><div class="summary-symbol">${compass}</div><div class="eyebrow">EXPEDITION COMPLETE · ${state.day} · ${esc(localized(state.roundLabel))}</div><h1>${t('complete')}</h1><div class="big-score">${state.total}<span> / 1,000</span></div><p>${t('note')}</p><section class="share-panel" aria-labelledby="share-title"><h2 id="share-title">${t('shareTitle')}</h2><img id="share-preview" alt="${t('shareAlt')}" width="1200" height="1200" hidden><button class="primary" id="share-result" disabled>${t('share')}</button><div class="share-actions"><button id="save-result" disabled>${t('save')}</button><button id="copy-result">${t('copy')}</button></div><p id="share-status" role="status" aria-live="polite"></p><details class="share-post"><summary>${t('post')}</summary><textarea id="share-text" aria-label="${t('post')}" readonly rows="7"></textarea></details></section><div class="summary-list">${state.questions.map((q, i) => `<button class="summary-row" data-index="${i}"><span class="summary-number">0${i + 1}</span><span>${esc(localized(q.title))}${q.answer.usedHint ? `<small>✦ ${t('used')}</small>` : ''}</span><strong>${q.answer.points}<small> / ${q.maxPoints}</small></strong><span>↗</span></button>`).join('')}</div><button class="other-round" id="other-round">${t('other')} →</button>${state.plan === 'free' ? adSlot() : ''}</section>`;
}
function settingsMarkup() {
  return `<details class="settings"><summary aria-label="${t('settings')}">☰</summary><div class="settings-panel"><nav class="round-picker">${state.rounds.map(r => `<button data-round="${r.id}" aria-pressed="${state.roundId === r.id}">${esc(localized(r.label))}</button>`).join('')}</nav><nav class="progress">${state.questions.map((q, i) => `<button class="step ${i === uiIndex ? 'current' : ''} ${q.answer ? 'done' : ''}" data-step="${i}" ${!q.answer && i !== currentIndex() ? 'disabled' : ''}>${q.answer ? '✓' : i + 1}</button>`).join('')}</nav><label>${t('plan')}<select id="plan"><option value="free" ${state.plan === 'free' ? 'selected' : ''}>${t('free')}</option><option value="premium" ${state.plan === 'premium' ? 'selected' : ''}>${t('premium')}</option></select></label><button id="locale" class="text-button">${locale === 'ja' ? 'English' : '日本語'}</button><p>${t('prototype')}</p><span>JAPAN · FIELD DISCOVERY v0.7</span></div></details>`;
}
function render() {
  if (!state) return;
  clearTimeout(revealFallback); disposeShare?.(); disposeShare = null;
  const mapNode = atlas && document.querySelector('#atlas');
  if (uiIndex === 5) { atlas?.destroy(); atlas = null; activeMapKey = null; }
  document.documentElement.lang = locale;
  document.title = locale === 'ja' ? 'ジオルーツ｜現場を探して、物語をひらく' : 'GeoRoots · Locate the site, uncover its story';
  app.innerHTML = `<div class="game-app"><header class="app-header"><a class="brand" href="/">${t('brand')}</a><div class="header-actions"><button class="help-button" id="how-to">? ${t('how')}</button><time>${state.day.replaceAll('-', '.')}</time>${settingsMarkup()}</div></header><main class="play-area">${uiIndex === 5 ? renderSummary() : renderQuestion(state.questions[uiIndex])}</main><dialog id="evidence-dialog"><div class="dialog-bar"><strong>${t('evidence')}</strong><button id="close-evidence">${t('close')} ×</button></div><img id="evidence-full" alt="${t('evidenceNote')}"><p>${t('evidenceNote')}</p><p class="evidence-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · OpenMapTiles · OpenFreeMap</p><p id="evidence-error" hidden>${locale === 'ja' ? '資料を取得できませんでした。開き直して再試行してください。' : 'Could not load the site map. Close and reopen to retry.'}</p></dialog><dialog id="discovery-dialog"></dialog><dialog id="help-dialog"><div class="dialog-bar"><strong>${t('how')}</strong><button id="close-help">${t('close')} ×</button></div><p>${t('help')}</p></dialog><div id="toast" role="alert" hidden></div><div class="sr-only" id="live-status" role="status" aria-live="polite"></div></div>`;
  if (mapNode && atlas) document.querySelector('#atlas').replaceWith(mapNode);
  bind();
}
function goTo(index) {
  if (submitting || switching) return;
  freshReveal = null; freshUnlock = []; uiIndex = index;
  selected = state.questions[index]?.attempts.at(-1)?.guess || null;
  render(); window.scrollTo({ top: 0 });
}
async function switchRound(id) {
  if (switching || submitting || state.roundId === id) return;
  switching = true; disableInputs();
  try {
    state = await api(stateRoute(id)); freshReveal = null; freshUnlock = [];
    uiIndex = state.completed ? 5 : currentIndex(); selected = state.questions[uiIndex]?.attempts.at(-1)?.guess || null;
    history.replaceState(null, '', `?round=${id}`); render(); window.scrollTo({ top: 0 });
  } catch (error) { render(); notify(error.message); }
  finally { switching = false; }
}
function disableInputs() { document.querySelectorAll('button, select').forEach(b => { if (!['close-evidence', 'close-help'].includes(b.id)) b.disabled = true; }); }
async function investigate(q, reveal = false) {
  if (submitting || switching || (!reveal && !selected)) return;
  submitting = true; disableInputs();
  const scroll = window.scrollY;
  document.querySelector('.game-board').classList.add('scanning');
  document.querySelector('.scan-label').hidden = false;
  try {
    const body = reveal ? { questionId: q.id } : { questionId: q.id, lat: selected[0], lng: selected[1], expectedAttempt: q.attempts.length, requestId: crypto.randomUUID() };
    const [next] = await Promise.all([api(reveal ? '/api/reveal' : '/api/answer', body), new Promise(resolve => setTimeout(resolve, reduced() ? 0 : 650))]);
    state = next; const updated = state.questions[uiIndex];
    freshReveal = updated.answer ? q.id : null;
    freshUnlock = updated.answer ? [] : updated.unlocked.filter(record => !q.unlocked.some(previous => previous.level === record.level)).map(record => record.level);
    const newLevels = freshUnlock;
    render(); window.scrollTo({ top: scroll, behavior: 'auto' });
    freshUnlock = [];
    if (newLevels.length) showDiscovery({ dialog: document.querySelector('#discovery-dialog'), question: updated, locale, levels: newLevels, isNew: true });
    document.querySelector('#live-status').textContent = updated.answer ? t('result') : `${t('stages')[updated.stage]} · ${number(updated.attempts.at(-1).distanceKm)} km`;
  } catch (error) {
    try { state = await api(stateRoute(state.roundId)); } catch {}
    freshReveal = null; render(); notify(error.message);
  } finally { submitting = false; }
}
async function updateDemo(route, body) {
  if (submitting || switching) return;
  submitting = true; disableInputs();
  try { state = await api(route, body); freshReveal = null; render(); }
  catch (error) { render(); notify(error.message); }
  finally { submitting = false; }
}
function updateReveal(q, progress, done) {
  const distance = document.querySelector('#distance-number'); if (!distance) return;
  distance.textContent = number(q.answer.distanceKm == null ? null : q.answer.distanceKm * progress);
  if (!done) return;
  freshReveal = null;
  document.querySelector('#points-number').textContent = q.answer.points;
  document.querySelector('#reveal-status').textContent = q.answer.withinRadius ? t('stages')[3] : t(q.answer.reason === 'revealed' ? 'endEarly' : 'attemptsEnd');
  document.querySelector('.result-details').hidden = false;
  document.querySelector('#next').disabled = false;
  document.querySelector('#skip-reveal').hidden = true;
  document.querySelector('#replay-reveal').hidden = !q.answer.guess;
  document.querySelector('.game-board').dataset.phase = 'complete';
  document.querySelector('#result-announcement').textContent = `${localized(q.title)} · ${number(q.answer.distanceKm)} km · ${q.answer.points}`;
}
function bind() {
  document.querySelector('#locale').onclick = () => { if (submitting || switching) return; locale = locale === 'ja' ? 'en' : 'ja'; localStorage.setItem('fieldnotes-locale', locale); freshReveal = null; render(); };
  document.querySelector('#plan').onchange = e => updateDemo('/api/demo-plan', { plan: e.target.value });
  document.querySelector('#how-to').onclick = () => document.querySelector('#help-dialog').showModal();
  document.querySelector('#close-help').onclick = () => document.querySelector('#help-dialog').close();
  document.querySelector('#close-evidence').onclick = () => document.querySelector('#evidence-dialog').close();
  document.querySelectorAll('[data-round]').forEach(b => b.onclick = () => switchRound(b.dataset.round));
  document.querySelectorAll('[data-step], [data-index]').forEach(b => b.onclick = () => goTo(Number(b.dataset.step ?? b.dataset.index)));
  if (uiIndex === 5) {
    const shareUrl = new URL('/', location.href); shareUrl.searchParams.set('round', state.roundId);
    disposeShare = mountResultShare({ state, locale, url: shareUrl.href });
    document.querySelector('#other-round').onclick = () => switchRound(state.roundId === 'first' ? 'second' : 'first');
    return;
  }
  const q = state.questions[uiIndex], key = `${state.roundId}:${q.id}`;
  const options = {
    container: document.querySelector('#atlas'), locale, basemap, questionKey: key,
    view: activeMapKey === key && atlas ? atlas.getView() : undefined,
    searchBounds: q.searchBounds, attempts: q.attempts, guess: q.answer ? q.answer.guess : selected,
    correct: q.answer && q.coordinate, readOnly: !!q.answer,
    animate: !!q.answer?.guess && freshReveal === q.id && !reduced(),
    onReveal: (p, done) => updateReveal(q, p, done),
    onSelect(coord) {
      if (submitting || switching || q.answer) return;
      selected = coord; document.querySelector('#pin-instruction').textContent = t('selected');
      document.querySelector('#lock-answer').disabled = false; document.querySelector('#return-pin').disabled = false;
    },
    onBasemapFallback() { changeBasemap('map', false); },
    onPinVisibility(visible) { const el = document.querySelector('#pin-offscreen'); if (el) el.hidden = visible || !!q.answer; },
    onStatus(status) {
      document.querySelector('#map-status').hidden = status !== 'loading';
      document.querySelector('#map-error').hidden = status !== 'error';
      if (status === 'tile-error' || status === 'imagery-error') {
        const warning = document.querySelector('#tile-warning'); warning.hidden = false;
        warning.querySelector('span').textContent = status === 'imagery-error' ? t('imageryError') : t('tileError');
      }
    }
  };
  if (atlas) atlas.update(options);
  else atlas = createAtlas(options);
  activeMapKey = key;
  if (options.animate) revealFallback = setTimeout(() => { atlas?.skipReveal(); updateReveal(q, 1, true); }, 6500);
  function changeBasemap(mode, persist = true) {
    basemap = mode; if (persist) localStorage.setItem('georoots-basemap', mode);
    atlas?.setBasemap?.(mode);
    document.querySelector('#basemap-satellite').setAttribute('aria-pressed', String(mode === 'satellite'));
    document.querySelector('#basemap-map').setAttribute('aria-pressed', String(mode === 'map'));
    document.querySelector('#open-evidence img').src = evidenceUrl(q);
    const full = document.querySelector('#evidence-full'); if (full.src) full.src = evidenceUrl(q);
  }
  document.querySelector('#basemap-satellite').onclick = () => changeBasemap('satellite');
  document.querySelector('#basemap-map').onclick = () => changeBasemap('map');
  document.querySelector('#zoom-in').onclick = () => atlas.zoomIn();
  document.querySelector('#zoom-out').onclick = () => atlas.zoomOut();
  document.querySelector('#reset-map').onclick = () => atlas.reset();
  document.querySelector('#area-map').onclick = () => atlas.area();
  document.querySelector('#return-pin').onclick = () => atlas.focusPin();
  function retryMap() { atlas.destroy(); atlas = null; activeMapKey = null; freshReveal = null; render(); }
  document.querySelector('#retry-map').onclick = retryMap;
  document.querySelector('#retry-tiles').onclick = retryMap;
  document.querySelector('#open-evidence').onclick = () => {
    const img = document.querySelector('#evidence-full'); img.src = evidenceUrl(q);
    img.onerror = () => { document.querySelector('#evidence-error').hidden = false; };
    img.onload = () => { document.querySelector('#evidence-error').hidden = true; };
    document.querySelector('#evidence-dialog').showModal();
  };
  document.querySelector('#center-pin')?.addEventListener('click', () => atlas.centerPin());
  document.querySelector('#lock-answer')?.addEventListener('click', () => investigate(q));
  document.querySelector('#reveal-destination')?.addEventListener('click', () => investigate(q, true));
  document.querySelector('#extra-hint')?.addEventListener('click', () => updateDemo('/api/hint', { questionId: q.id }));
  document.querySelector('#review-discovery')?.addEventListener('click', () => showDiscovery({ dialog: document.querySelector('#discovery-dialog'), question: q, locale }));
  document.querySelectorAll('[data-attempt]').forEach(b => b.onclick = () => atlas.focus(q.attempts[Number(b.dataset.attempt)].guess, atlas.getView().zoom));
  document.querySelector('#focus-answer')?.addEventListener('click', () => { atlas.focus(q.coordinate); document.querySelector('.atlas-stage').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); });
  document.querySelector('#focus-guess')?.addEventListener('click', () => { atlas.focus(q.answer.guess); document.querySelector('.atlas-stage').scrollIntoView({ block: 'start' }); });
  document.querySelector('#skip-reveal')?.addEventListener('click', () => { atlas.skipReveal(); updateReveal(q, 1, true); });
  document.querySelector('#replay-reveal')?.addEventListener('click', () => { freshReveal = q.id; render(); });
  document.querySelector('#next')?.addEventListener('click', () => goTo(uiIndex === 4 ? 5 : uiIndex + 1));
}
app.innerHTML = `<p class="loading">${t('loading')}</p>`;
try {
  const requested = new URL(location.href).searchParams.get('round');
  state = await api(stateRoute(['first', 'second'].includes(requested) ? requested : null));
  uiIndex = state.completed ? 5 : currentIndex(); selected = state.questions[uiIndex]?.attempts.at(-1)?.guess || null; render();
} catch (error) { app.innerHTML = `<p class="loading">${t('error')}</p>`; console.error(error); }
