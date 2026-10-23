import './fieldwork.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let state, view = 'map', selected = {}, error = '', busy = false, intent, imageReady = false, imageFailed = false;
let dialogReturn, zoom = 1, resultBlob;
let inspectionQueue = Promise.resolve();
const checked = id => state.inspected.includes(id);
const sceneById = id => state.scenes.find(s => s.id === id);
const labelFor = (slot, value) => state.slots.find(s => s.id === slot)?.options.find(o => o.id === value)?.label;
const image = (panel, alt, extra = '') => `<div class="f-image f-panel-${panel} ${extra}" role="img" aria-label="${esc(alt)}"></div>`;
const arrow = '<span aria-hidden="true">↗</span>';

async function api(action = 'state', body) {
  const response = await fetch(`/api/fieldwork/${action}`, { method: body ? 'POST' : 'GET',
    credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '通信を確認して、もう一度お試しください。'), { state: data.state });
  return data;
}
async function mutate(action, body) {
  if (busy) return false;
  busy = true; error = ''; updateBusy();
  try { state = await api(action, body); return true; }
  catch (e) {
    if (e.state) state = e.state;
    else {
      try {
        state = await api();
        if (action === 'inspect' && checked(body.sceneId) || action === 'options' && state.optionsOpened || action === 'answer' && state.answer?.requestId === body.requestId) return true;
      } catch { /* The current page and draft remain usable when offline. */ }
    }
    error = e.name === 'TimeoutError' ? '保存の確認に時間がかかっています。通信を確認して、もう一度お試しください。' : e instanceof TypeError ? '通信を確認して、もう一度お試しください。' : e.message;
    return false;
  } finally { busy = false; updateBusy(); }
}
function updateBusy() {
  app.setAttribute('aria-busy', String(busy));
  document.querySelectorAll('[data-mutation]').forEach(b => { b.disabled = busy || b.id === 'f-submit' && !complete(); });
}
function complete() { return state.slots?.every(s => selected[s.id]); }
function top() { window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('h1')?.focus({ preventScroll: true }); }
function sceneButton(s, compact = false) {
  return `<button class="f-place ${checked(s.id) ? 'is-seen' : ''} ${compact ? 'is-compact' : ''}" data-scene="${s.id}">
    ${image(s.panel, s.alt)}<span class="f-place-copy"><small>${s.number} / ${esc(s.kind)}</small><strong>${esc(s.name)}</strong></span>
    <span class="f-place-state">${checked(s.id) ? '確認済み ✓' : '調べる ↗'}</span></button>`;
}
function mapMarkup(solved = false) {
  return `<div class="f-map ${solved ? 'is-solved' : ''}">${image('overview', '川、橋、祠と民家の位置が分かる架空の集落の見取り図。')}
    ${solved ? `<svg class="f-connection" viewBox="0 0 1000 667" preserveAspectRatio="none" aria-hidden="true"><path d="M 280 167 Q 480 50 860 354"/><path d="M 290 414 Q 570 600 860 354"/></svg>` : ''}
    ${state.scenes.map(s => `<button class="f-hotspot ${checked(s.id) ? 'is-seen' : ''}" data-scene="${s.id}" aria-label="${esc(s.name)}を調べる${checked(s.id) ? '・確認済み' : ''}" style="--x:${s.x}%;--y:${s.y}%"><span>${s.number}</span>${checked(s.id) ? '<i aria-hidden="true">✓</i>' : ''}</button>`).join('')}
    <button class="f-map-enlarge" id="f-map-enlarge">全体を拡大 ${arrow}</button>
    ${!imageReady ? `<div class="f-art-status" role="status">${imageFailed ? '画像を読み込めませんでした。' : '集落の画像を準備しています…'}${imageFailed ? '<button id="f-image-retry">再読み込み</button>' : ''}</div>` : ''}</div>`;
}
function mapView() {
  return `<div class="f-layout"><section class="f-map-section" aria-label="調査する集落">${mapMarkup()}<div class="f-map-caption"><span><i></i> 番号の場所をタップして調べる</span><span>架空の集落</span></div></section>
    <aside class="f-investigation"><div class="f-section-label"><h2>調べる場所</h2><span>${state.inspected.length} / 3 確認</span></div><div class="f-places">${state.scenes.map(s => sceneButton(s)).join('')}</div>
    <button class="f-compare-button" id="f-compare" ${state.inspected.length ? '' : 'disabled'}>見つけたものを見比べる <span>${state.inspected.length}</span></button>
    <p class="f-tip">同じ物が、別の場所にもある。<br>形と、持っている人に注目してみて。</p></aside></div>`;
}
function compareView() {
  const scenes = state.scenes.filter(s => checked(s.id));
  return `<section class="f-compare"><div class="f-section-label"><h2>見つけたものを見比べる</h2><span>${scenes.length} / 3</span></div>
    <div class="f-compare-grid">${scenes.map(s => `<article><button data-scene="${s.id}" aria-label="${esc(s.name)}の画像を拡大">${image(s.panel, s.alt)}<span class="f-enlarge-label">拡大する ${arrow}</span></button><div class="f-compare-caption"><small>${s.number} / ${esc(s.name)}</small><p>${esc(s.caption)}</p></div></article>`).join('')}</div>
    ${scenes.length < 3 ? '<p class="f-tip">まだ見ていない場所も、見取り図から調べられます。</p>' : ''}
    <button class="f-text-button" id="f-to-map">← 見取り図に戻る</button></section>`;
}
function answerView() {
  return `<section class="f-deduction"><div class="f-section-label"><h2>二つの考察をつなげる</h2><span>回答は１回</span></div>
    <div class="f-reference-strip">${state.scenes.map(s => `<button data-scene="${s.id}" aria-label="${esc(s.name)}を見直す">${image(s.panel, s.alt)}<span>${esc(s.name)}</span></button>`).join('')}</div>
    ${state.slots.map((s, i) => `<fieldset class="f-answer-slot"><legend><span>0${i + 1}</span>${esc(s.label)}</legend><div class="f-options">${s.options.map(o => `<button class="${selected[s.id] === o.id ? 'is-selected' : ''}" data-slot="${s.id}" data-option="${o.id}" aria-pressed="${selected[s.id] === o.id}"><i aria-hidden="true">${selected[s.id] === o.id ? '✓' : ''}</i>${esc(o.label)}</button>`).join('')}</div></fieldset>`).join('')}
    <p class="f-tip">画像は上の３枚から見直せます。調べる順番や回数では減点しません。</p>
    <button class="f-text-button" id="f-to-map">← 調査に戻る</button></section>`;
}
function resultView() {
  const r = state.reveal, a = state.answer;
  return `<section class="f-result"><div class="f-result-score"><span>${a.words === null ? '答えを公開' : a.points === 100 ? '考察一致' : a.points ? '一部が一致' : '答え合わせ'}</span><strong>${a.points}<small> / 100</small></strong></div>
    <h1 tabindex="-1">${esc(r.title)}</h1><p class="f-result-lead">${esc(r.lead)}</p>
    <div class="f-result-words">${state.slots.map(s => `<div><small>${esc(s.label)}</small><strong>${esc(labelFor(s.id, state.solution[s.id]))}</strong>${a.words ? `<span>${a.matched.includes(s.id) ? '✓ あなたの考察と一致' : `あなたの考察：${esc(labelFor(s.id, a.words[s.id]))}`}</span>` : '<span>考察を見送った項目</span>'}</div>`).join('')}</div>
    <div class="f-result-map">${mapMarkup(true)}</div><p class="f-connection-note">形・作り方・願う人。三つの場所がつながる。</p>
    <div class="f-proof-grid">${r.proofs.map((p, i) => { const s = sceneById(p.sceneId); return `<article class="f-proof" style="--delay:${i * 130}ms"><button data-scene="${s.id}" aria-label="${esc(s.name)}の画像を見直す">${image(s.panel, s.alt)}</button><div><small>${s.number} / ${esc(s.name)}</small><p>${esc(p.text)}</p></div></article>`; }).join('')}</div>
    <section class="f-story"><span class="f-eyebrow">この物語の背景</span><h2>不気味に見えた物が、<br>誰かの切実な願いに変わる。</h2><p>${esc(r.story)}</p></section>
    <details class="f-real-source"><summary><span>着想元になった、実在の風習</span><i aria-hidden="true">＋</i></summary><div><h2>${esc(r.realTitle)}</h2><p>${esc(r.realStory)}</p><a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source.label)} ${arrow}</a><p class="f-source-note">参照：${r.source.readAt}。伝承・信仰の紹介であり、効能や怪異の実在を証明するものではありません。</p></div></details>
    <div class="f-result-actions"><button class="f-secondary" id="f-save-result" ${resultBlob ? '' : 'disabled'}>結果画像を保存</button><button class="f-secondary" id="f-copy-result">結果をコピー</button></div><p class="f-share-note">結果画像とコピー文には、答えを載せません。</p>
    <button class="f-text-button" id="f-replay">この一話をもう一度調べる</button><p class="f-end-note">固定１話の試作です。続く物語・毎日の新問は準備前です。</p></section>`;
}
function render() {
  if (!state) return;
  if (state.answer) view = 'result';
  app.className = 'fieldwork-app';
  app.style.setProperty('--scene-image', `url("${state.imageUrl}")`);
  app.innerHTML = `<header class="f-header"><a href="/?mode=fieldwork" class="f-brand"><span aria-hidden="true">異</span>異聞調査録<small>画像で読み解く短編</small></a><button class="f-help" id="f-help" aria-label="遊び方">?</button></header>
    <main>${view !== 'result' ? `<div class="f-heading"><p class="f-eyebrow">調査 01 <span>創作の物語 × 実在の民俗</span></p><h1 tabindex="-1">${esc(state.title)}</h1><p class="f-premise">${esc(state.intro)}</p></div>` : ''}
    ${error ? `<p class="f-error" role="alert">${esc(error)}</p>` : ''}
    ${view === 'result' ? resultView() : view === 'map' ? mapView() : view === 'compare' ? compareView() : answerView()}
    <p class="f-fiction-note">${esc(state.fictionNote)}</p></main>
    ${view !== 'result' ? `<footer class="f-dock"><span>${view === 'answer' ? '形と願いをつなげよう' : `調査メモ ${state.inspected.length} / 3`}</span>${view === 'answer' ? `<button class="f-primary" id="f-submit" data-mutation ${complete() ? '' : 'disabled'}>この考察で答え合わせ →</button>` : '<button class="f-primary" id="f-deduce" data-mutation>考察をまとめる →</button>'}<button class="f-skip" id="f-skip">答えを見る</button></footer>` : ''}
    <dialog id="f-dialog" aria-label="現場を調べる"></dialog><div class="f-toast" role="status" aria-live="polite"></div>`;
  bind(); updateBusy();
}
function bind() {
  document.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => openScene(b.dataset.scene));
  document.querySelector('#f-map-enlarge')?.addEventListener('click', () => openScene('overview'));
  document.querySelector('#f-image-retry')?.addEventListener('click', loadImage);
  document.querySelector('#f-help').onclick = () => openText('遊び方', '<p>見取り図の３カ所をタップして、画像と短い証言を調べます。同じ物の形や、持っている人を見比べてみてください。</p><p>「考察をまとめる」で二つの答えを選び、答え合わせへ。画像は何度でも見直せます。分からないときも「答えを見る」で全解説を読めます。</p><p>人物・集落・出来事は創作。実在の風習を着想元にしています。</p>');
  document.querySelector('#f-compare')?.addEventListener('click', () => { view = 'compare'; render(); top(); });
  document.querySelector('#f-to-map')?.addEventListener('click', () => { view = 'map'; render(); top(); });
  document.querySelector('#f-deduce')?.addEventListener('click', async () => {
    if (state.optionsOpened || await mutate('options', {})) view = 'answer';
    render(); top();
  });
  document.querySelectorAll('[data-option]').forEach(b => b.onclick = () => {
    selected[b.dataset.slot] = b.dataset.option;
    document.querySelectorAll(`[data-slot="${b.dataset.slot}"]`).forEach(el => {
      const active = el.dataset.option === selected[b.dataset.slot];
      el.classList.toggle('is-selected', active); el.setAttribute('aria-pressed', String(active)); el.querySelector('i').textContent = active ? '✓' : '';
    });
    intent = undefined; updateBusy();
  });
  document.querySelector('#f-submit')?.addEventListener('click', () => confirmAnswer(false));
  document.querySelector('#f-skip')?.addEventListener('click', () => confirmAnswer(true));
  document.querySelector('#f-replay')?.addEventListener('click', () => openText('最初から調べますか？', '<p>この一話の考察と調査メモを消して、やり直します。他のデモの記録は消えません。</p>', async () => {
    closeDialog(); if (await mutate('reset', { confirm: true })) { view = 'map'; selected = {}; intent = undefined; resultBlob = undefined; }
    render(); top();
  }, '最初から調べる'));
  document.querySelector('#f-save-result')?.addEventListener('click', () => {
    if (!resultBlob) return; const url = URL.createObjectURL(resultBlob), a = document.createElement('a');
    a.href = url; a.download = 'ibun-investigation-result.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
  document.querySelector('#f-copy-result')?.addEventListener('click', async () => {
    const a = state.answer, marks = state.slots.map(s => a.matched.includes(s.id) ? '🟩' : '⬜').join('');
    const text = `異聞調査録｜画像で読み解く短編\n${a.points} / 100 点 ${marks}\n集落を調べて、一つの物語を読み解きました。\n${location.origin}/?mode=fieldwork`;
    try { await navigator.clipboard.writeText(text); toast('結果をコピーしました。'); }
    catch { openText('共有する結果', `<p>コピーして投稿できます。</p><textarea readonly aria-label="共有する結果">${esc(text)}</textarea>`); }
  });
  if (view === 'result' && !resultBlob) makeResultImage().then(blob => { resultBlob = blob; const b = document.querySelector('#f-save-result'); if (b) b.disabled = false; }).catch(() => toast('結果画像を作れませんでした。結果のコピーは利用できます。'));
}
function toast(text) { const el = document.querySelector('.f-toast'); el.textContent = text; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.textContent = ''; }, 3500); }
function setupDialog(className, html, title) {
  const d = document.querySelector('#f-dialog'); dialogReturn = document.activeElement;
  d.className = className; d.setAttribute('aria-label', title); d.innerHTML = html;
  d.onclose = () => { document.body.classList.remove('f-modal-open'); dialogReturn?.focus({ preventScroll: true }); };
  d.onclick = e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } };
  d.showModal(); document.body.classList.add('f-modal-open');
  d.querySelector('[data-close]')?.addEventListener('click', closeDialog);
  return d;
}
function closeDialog() { document.querySelector('#f-dialog')?.close(); }
async function openScene(id) {
  if (document.querySelector('#f-dialog')?.open) closeDialog();
  const overview = id === 'overview', s = overview ? { name: '集落の見取り図', panel: 'overview', alt: '川、橋と三つの調査場所が見える集落の全景。', caption: '川を挟んで、民家と小さな祠がある。', voice: '' } : sceneById(id);
  const first = !overview && !checked(id) && !state.answer;
  zoom = 1;
  const d = setupDialog('f-scene-dialog', `<header><div><small>${overview ? '全体を見る' : `${s.number} / 現場を見る`}</small><h2>${esc(s.name)}</h2></div><button class="f-close" data-close aria-label="閉じて調査に戻る">×</button></header>
    <div class="f-photo-scroll"><div class="f-zoom-content">${image(s.panel, s.alt, first ? 'f-unseal' : '')}</div></div>
    <div class="f-zoom-bar"><span>生成イラスト ${first ? '<i class="f-new-memo">調査メモを開封</i>' : ''}</span><div><button id="f-zoom-out" aria-label="画像を縮小" disabled>−</button><output id="f-zoom-value">100%</output><button id="f-zoom-in" aria-label="画像を拡大">＋</button></div></div>
    <p class="f-pan-hint" hidden>画像を指で動かして、細部を見られます。</p>
    <div class="f-scene-copy"><p>${esc(s.caption)}</p>${s.voice ? `<blockquote>${esc(s.voice)}</blockquote>` : ''}</div>
    <p class="f-inspect-status" role="status">${overview ? '人物・集落・出来事は創作です。' : checked(id) ? '✓ 調査メモに記録済み' : '調査メモに記録しています…'}</p>
    <button class="f-primary f-return" data-close-bottom>調査に戻る →</button>`, s.name);
  d.dataset.sceneId = id;
  d.querySelector('[data-close-bottom]').onclick = closeDialog;
  const adjust = delta => {
    zoom = Math.min(3, Math.max(1, Math.round((zoom + delta) * 2) / 2));
    d.querySelector('.f-zoom-content').style.width = `${zoom * 100}%`;
    d.querySelector('#f-zoom-value').textContent = `${zoom * 100}%`;
    d.querySelector('#f-zoom-out').disabled = zoom === 1; d.querySelector('#f-zoom-in').disabled = zoom === 3;
    d.querySelector('.f-pan-hint').hidden = zoom === 1;
  };
  d.querySelector('#f-zoom-in').onclick = () => adjust(.5); d.querySelector('#f-zoom-out').onclick = () => adjust(-.5);
  const scroll = d.querySelector('.f-photo-scroll');
  let pinch;
  scroll.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    const [a, b] = e.touches, rect = scroll.getBoundingClientRect();
    const x = (a.clientX + b.clientX) / 2 - rect.left, y = (a.clientY + b.clientY) / 2 - rect.top;
    pinch = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom, x, y,
      contentX: (scroll.scrollLeft + x) / zoom, contentY: (scroll.scrollTop + y) / zoom };
  }, { passive: true });
  scroll.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    zoom = Math.min(3, Math.max(1, pinch.zoom * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(1, pinch.distance)));
    d.querySelector('.f-zoom-content').style.width = `${zoom * 100}%`;
    scroll.scrollLeft = pinch.contentX * zoom - pinch.x; scroll.scrollTop = pinch.contentY * zoom - pinch.y;
    d.querySelector('#f-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    d.querySelector('#f-zoom-out').disabled = zoom <= 1; d.querySelector('#f-zoom-in').disabled = zoom >= 3;
    d.querySelector('.f-pan-hint').hidden = zoom <= 1;
  }, { passive: false });
  scroll.addEventListener('touchend', () => { pinch = undefined; }, { passive: true });
  scroll.addEventListener('touchcancel', () => { pinch = undefined; }, { passive: true });
  if (overview || checked(id) || state.answer) return;
  const operation = inspectionQueue.then(() => checked(id) || mutate('inspect', { sceneId: id }));
  inspectionQueue = operation.catch(() => false);
  const saved = await operation;
  // Closing the photo must never reopen it or move the reader when saving finishes.
  if (d.isConnected && d.open && d.dataset.sceneId === id) {
    const status = d.querySelector('.f-inspect-status'); status.textContent = saved ? '✓ 調査メモに記録しました' : error;
    if (!saved) { const retry = document.createElement('button'); retry.textContent = '保存を再試行'; retry.onclick = async () => { closeDialog(); await openScene(id); }; status.append(retry); }
  } else if (!document.querySelector('#f-dialog')?.open) render();
  refreshObserved();
}
function refreshObserved() {
  document.querySelectorAll('[data-scene]').forEach(el => { if (checked(el.dataset.scene)) { el.classList.add('is-seen'); const label = el.querySelector('.f-place-state'); if (label) label.textContent = '確認済み ✓'; } });
  const count = document.querySelector('.f-section-label > span'); if (count && view === 'map') count.textContent = `${state.inspected.length} / 3 確認`;
  const compare = document.querySelector('#f-compare'); if (compare) { compare.disabled = !state.inspected.length; compare.querySelector('span').textContent = state.inspected.length; }
  const dock = document.querySelector('.f-dock > span'); if (dock && view !== 'answer') dock.textContent = `調査メモ ${state.inspected.length} / 3`;
}
async function confirmAnswer(skip) {
  if (busy) return;
  if (skip && !state.optionsOpened) { if (!await mutate('options', {})) { render(); return; } }
  const html = skip ? '<p>考察は０点として記録し、すべての画像・物語・着想元を公開します。</p>' : `<p>この二つの考察で答え合わせします。</p><dl>${state.slots.map(s => `<dt>${esc(s.label)}</dt><dd>${esc(labelFor(s.id, selected[s.id]))}</dd>`).join('')}</dl><p>確定後は回答を変更できません。</p>`;
  openText(skip ? '答えを見ますか？' : '考察を確定しますか？', html, async () => {
    closeDialog();
    const words = skip ? null : { ...selected };
    if (!intent || JSON.stringify(intent.words) !== JSON.stringify(words)) intent = { words, requestId: crypto.randomUUID() };
    if (await mutate('answer', intent)) view = 'result';
    render(); top();
  }, skip ? '答えを公開する' : 'この考察で確定する');
}
function openText(title, html, action, actionLabel) {
  const d = setupDialog('f-text-dialog', `<header><h2>${esc(title)}</h2><button class="f-close" data-close aria-label="閉じる">×</button></header><div class="f-dialog-copy">${html}</div>${action ? `<button class="f-primary" id="f-confirm">${esc(actionLabel)}</button><button class="f-text-button" id="f-cancel">戻って考える</button>` : ''}`, title);
  if (action) { d.querySelector('#f-confirm').onclick = action; d.querySelector('#f-cancel').onclick = closeDialog; }
}
async function makeResultImage() {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101c1c'; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#c0aa76'; ctx.lineWidth = 2; ctx.strokeRect(35, 35, 1130, 560);
  ctx.fillStyle = '#d7c59c'; ctx.font = '28px sans-serif'; ctx.fillText('異聞調査録 / 画像で読み解く短編', 75, 110);
  ctx.fillStyle = '#eee7d4'; ctx.font = 'bold 155px sans-serif'; ctx.fillText(String(state.answer.points), 75, 310);
  ctx.font = '38px sans-serif'; ctx.fillStyle = '#abb9a9'; ctx.fillText('/ 100 点', 400, 304);
  state.slots.forEach((s, i) => { ctx.fillStyle = state.answer.matched.includes(s.id) ? '#bed0ad' : '#44574f'; ctx.fillRect(80 + i * 150, 360, 125, 65); });
  ctx.fillStyle = '#dddcc7'; ctx.font = '32px sans-serif'; ctx.fillText('集落を調べて、一つの物語を読み解く。', 80, 510);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('画像作成失敗')), 'image/png'));
}
function loadImage() {
  imageFailed = false; imageReady = false;
  const img = new Image();
  img.onload = () => { imageReady = true; document.querySelector('.f-art-status')?.remove(); };
  img.onerror = () => { imageFailed = true; if (!document.querySelector('#f-dialog')?.open) render(); };
  img.src = state.imageUrl;
}
app.innerHTML = '<p class="f-starting" role="status">調査を準備しています…</p>';
try { state = await api(); render(); loadImage(); }
catch { app.innerHTML = '<div class="f-starting"><p>調査を読み込めませんでした。通信を確認してください。</p><button onclick="location.reload()">もう一度読み込む</button></div>'; }
