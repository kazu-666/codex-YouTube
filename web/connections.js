import './connections.css';
import './connections-theme.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state, selected = new Set(), order, busy = false, notice = '', noticeKind = '', intent, imageReady = false, imageFailed = false;
const tileById = id => state.tiles.find(t => t.id === id);
const solvedIds = () => new Set(state.groups.flatMap(g => g.tileIds));
const remaining = () => (order || state.tiles.map(t => t.id)).filter(id => !solvedIds().has(id));
const photoNumber = tile => String(tile.panel + 1).padStart(2, '0');
const photo = tile => `<span class="c-photo" role="img" aria-label="${esc(tile.alt)}" style="background-position:${tile.panel % state.photoColumns * 100 / (state.photoColumns - 1)}% ${Math.floor(tile.panel / state.photoColumns) * 100 / (state.photoRows - 1)}%"></span>`;
const mini = (tile, caption = tile.label) => `<figure class="c-mini"><button data-preview="${tile.id}" aria-label="${esc(tile.label)}の写真を拡大">${photo(tile)}</button><figcaption>${esc(caption)}</figcaption></figure>`;

async function api(action = 'state', body) {
  const response = await fetch(`/api/connections/${action}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || data.feedback?.message || '通信を確認してください。'), { snapshot: data.state || (data.runId ? data : undefined) });
  return data;
}
function render() {
  const focused = document.activeElement;
  const restore = focused?.closest('#app') ? focused.dataset.tile ? `[data-tile="${focused.dataset.tile}"]` : focused.id ? `#${focused.id}` : undefined : undefined;
  const ended = state.status !== 'playing';
  app.className = 'connections-app photo-connections';
  document.documentElement.style.setProperty('--received-photos', `url("${state.imageUrl}")`);
  document.documentElement.style.setProperty('--photo-columns', state.photoColumns);
  document.documentElement.style.setProperty('--photo-rows', state.photoRows);
  app.innerHTML = `<header class="c-header"><a href="/?mode=connections">異聞調査録<span>繋がりのパズル</span></a><span>FILE ${esc(state.fileNumber)}</span><button id="c-help" aria-label="遊び方">？</button></header>
    <main><div class="c-heading"><div><p class="c-eyebrow">12 PHOTOS / 3 CONNECTIONS</p><h1>${esc(state.title)}</h1></div><p class="c-progress"><strong>${state.groups.length}</strong> / ${state.totalGroups}<span>繋がりを発見</span></p></div>
    <p id="c-image-status" role="status" ${imageReady ? 'hidden' : ''}>${imageFailed ? '写真を受信できませんでした。<button id="c-image-retry">再読み込み</button>' : '写真を受信しています…'}</p>
    ${!ended ? `<p class="c-instruction">つながる写真を４枚選ぶ。</p><section class="c-grid" aria-label="12枚の写真">${remaining().map(id => {
      const t = tileById(id), active = selected.has(id);
      return `<div class="c-image-tile ${active ? 'is-selected' : ''}"><button class="c-select" data-tile="${id}" aria-label="写真${photoNumber(t)}を選ぶ" aria-pressed="${active}" ${busy || !imageReady ? 'disabled' : ''}>${photo(t)}<span class="c-photo-number">${photoNumber(t)}</span><span class="c-check" aria-hidden="true">${active ? '✓' : ''}</span></button><button class="c-enlarge" data-preview="${id}" aria-label="写真${photoNumber(t)}を拡大" ${!imageReady ? 'disabled' : ''}>⤢</button></div>`;
    }).join('')}</section>` : ''}
    <p id="c-notice" class="c-notice ${esc(noticeKind)}" role="status" aria-live="polite">${esc(notice || (ended ? '見つけた繋がりを、写真で振り返れます。' : '右下の ⤢ で、写真を大きく見られます。'))}</p>
    <div class="c-found" aria-label="見つけた繋がり">${state.groups.map(g => groupView(g)).join('')}</div>
    ${ended ? resultView() : `<div class="c-tools"><button id="c-shuffle" ${busy ? 'disabled' : ''}>並べ替える</button><button id="c-clear" ${busy || !selected.size ? 'disabled' : ''}>選択を外す</button><button id="c-reveal" ${busy ? 'disabled' : ''}>答えを見る</button></div>`}
    <footer class="c-footer"><p>${esc(state.fictionNote)}</p></footer></main>
    ${!ended ? `<div class="c-dock"><div class="c-dock-inner"><div class="c-lives" aria-label="残り${state.maxMistakes - state.mistakes}回"><span>残り</span>${Array.from({ length: state.maxMistakes }, (_, i) => `<i class="${i < state.maxMistakes - state.mistakes ? '' : 'spent'}" aria-hidden="true"></i>`).join('')}</div><button class="c-submit" id="c-submit" ${selected.size === state.groupSize && !busy && imageReady ? '' : 'disabled'}>${busy ? '照合しています…' : `繋がりを確かめる <span>${selected.size} / ${state.groupSize}</span>`}</button></div></div>` : ''}`;
  document.querySelectorAll('[data-tile]').forEach(button => button.onclick = () => toggle(button.dataset.tile));
  document.querySelector('#c-submit')?.addEventListener('click', guess);
  document.querySelector('#c-clear')?.addEventListener('click', () => { selected.clear(); intent = undefined; notice = ''; noticeKind = ''; render(); });
  document.querySelector('#c-shuffle')?.addEventListener('click', shuffle);
  document.querySelector('#c-reveal')?.addEventListener('click', reveal);
  document.querySelector('#c-reset')?.addEventListener('click', reset);
  document.querySelector('#c-copy')?.addEventListener('click', copyResult);
  document.querySelector('#c-save')?.addEventListener('click', saveResult);
  document.querySelector('#c-help').onclick = showHelp;
  document.querySelector('#c-image-retry')?.addEventListener('click', loadImage);
  attachViews(document);
  if (restore) document.querySelector(restore)?.focus({ preventScroll: true });
}
function groupView(group, detailed = false) {
  const matched = noticeKind === 'matched' && state.feedback?.title === group.title;
  if (!detailed) return `<button class="c-solved-strip ${esc(group.color)}" data-group="${state.groups.indexOf(group)}"><span class="c-strip-photos">${group.tileIds.map(id => photo(tileById(id))).join('')}</span><span><small>${esc(group.difficulty)}・発見</small><strong>${esc(group.title)}</strong></span><span aria-hidden="true">↗</span></button>`;
  return `<article class="c-group c-visual-group ${esc(group.color)} ${group.found ? 'found' : 'unfound'} ${matched ? 'just-found' : ''}">
    <div class="c-word-group-heading"><span>${esc(group.difficulty)}${group.found ? '・発見' : '・未発見'}</span><h2>${esc(group.title)}</h2></div>
    ${visualView(group)}<p class="c-group-lead">${esc(group.lead)}</p>
    <details class="c-group-more"><summary>背景を読む</summary><p>${esc(group.detail)}</p></details></article>`;
}
function visualView(group) {
  const icons = {
    effigy: '<circle cx="40" cy="13" r="9"/><path d="M29 25 L18 42 L26 48 L31 39 L29 61 L20 78 L31 82 L40 66 L49 82 L60 78 L51 61 L49 39 L54 48 L62 42 L51 25 Z"/><path d="M40 27 V61 M35 34 L45 39 M35 45 L45 50"/>',
    confinement: '<path d="M25 4 H55 L64 24 L58 82 H22 L16 24 Z"/><path d="M40 23 V8 M34 14 L40 8 L46 14 M34 43 L19 38 M25 34 L19 38 L23 44 M46 57 L60 52 M54 48 L60 52 L56 58"/>',
    seal: '<path d="M6 30 L40 5 L74 30 M14 27 V80 H66 V27 M31 80 V44 H50 V80 M20 36 H27 V51 H20 Z M54 36 H61 V51 H54 Z"/><path d="M25 60 H56 M27 55 V65 M53 55 V65"/>'
  };
  return `<div class="c-quartet c-case-photos">${group.facts.map(f => mini(tileById(f.tileId), f.from)).join('')}</div>
    <div class="c-case-relation" aria-label="${esc(group.relation)}"><svg class="c-case-links" viewBox="0 0 400 35" preserveAspectRatio="none" aria-hidden="true"><path d="M50 0 L200 32 M150 0 L200 32 M250 0 L200 32 M350 0 L200 32"/></svg><svg class="c-case-symbol" viewBox="0 0 80 88" aria-hidden="true">${icons[group.visual] || icons.effigy}</svg><strong>${esc(group.relation)}</strong></div>`;
}
function attachViews(root) {
  root.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => openPreview(button.dataset.preview));
  root.querySelectorAll('[data-group]').forEach(button => button.onclick = () => showDiscovery(state.groups[Number(button.dataset.group)], false));
}
function resultView() {
  const heading = state.status === 'completed' ? '３つの繋がりを発見' : state.status === 'failed' ? '照合を終了しました' : '答えを公開しました';
  return `<section class="c-result" tabindex="-1"><p class="c-eyebrow">${heading}</p><div class="c-score"><strong>${state.points}</strong><span>/ ${state.maxPoints} 点</span></div>
    ${state.remainingGroups.length ? `<div class="c-remaining">${state.remainingGroups.map(g => groupView(g, true)).join('')}</div>` : ''}
    <h2>${esc(state.reveal.title)}</h2><p>${esc(state.reveal.story)}</p>
    <details class="c-sources"><summary>${esc(state.reveal.sourceHeading || '背景・出典について')} <span>＋</span></summary><div><p>${esc(state.reveal.fiction)}</p><p>${esc(state.reveal.sourceNote)}</p>${state.reveal.sources.map(s => `<article><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><p>${esc(s.scope)}</p><small>${esc(s.status)}</small></article>`).join('')}</div></details>
    <div class="c-share"><button id="c-copy">結果をコピー</button><button id="c-save">結果画像を保存</button></div><p class="c-share-note">共有する結果に、写真と答えは載せません。</p><button id="c-reset" class="c-reset" ${busy ? 'disabled' : ''}>もう一度遊ぶ</button></section>`;
}
function toggle(id) {
  if (busy || !imageReady || state.status !== 'playing') return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < state.groupSize) selected.add(id);
  else { notice = '４枚選択中です。別の写真を選ぶには、一枚外してください。'; noticeKind = ''; render(); return; }
  intent = undefined; notice = ''; noticeKind = ''; render();
}
function shuffle() {
  if (busy) return;
  order ||= state.tiles.map(t => t.id);
  for (let i = order.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  noticeKind = ''; render();
}
async function mutate(action, body) {
  const oldHistory = state.history.length, oldRun = state.runId;
  busy = true; notice = ''; render();
  try {
    state = await api(action, body);
    notice = state.feedback?.kind === 'matched' ? '繋がりを見つけました。' : state.feedback?.message || '';
    noticeKind = state.feedback?.kind || ''; return true;
  } catch (error) {
    if (error.snapshot) state = error.snapshot;
    else { try { state = await api(); } catch { /* Preserve request ID and selection for a safe retry. */ } }
    if (state.runId !== oldRun) { selected.clear(); order = undefined; intent = undefined; }
    const committed = state.history.length > oldHistory || action === 'reveal' && state.status !== 'playing' || action === 'reset' && state.runId !== oldRun;
    notice = committed ? '保存された照合結果を復元しました。' : error.message; noticeKind = committed ? 'restored' : 'error'; return committed;
  } finally {
    busy = false; const found = solvedIds(); selected = new Set([...selected].filter(id => !found.has(id))); render();
  }
}
async function guess() {
  if (busy || !imageReady || selected.size !== state.groupSize) return;
  const previous = new Set(state.groups.map(g => g.title));
  const ids = [...selected], signature = ids.slice().sort().join(',');
  if (!intent || intent.signature !== signature || intent.runId !== state.runId) intent = { signature, runId: state.runId, requestId: crypto.randomUUID(), tileIds: ids };
  if (await mutate('guess', { runId: intent.runId, requestId: intent.requestId, tileIds: intent.tileIds })) {
    intent = undefined; render(); const discovered = state.groups.find(g => !previous.has(g.title));
    if (discovered) showDiscovery(discovered, true);
  }
}
async function reveal() {
  if (busy || !confirm('残りの答えを公開しますか？ 見つけた分の点数を記録します。')) return;
  await mutate('reveal', { runId: state.runId, requestId: crypto.randomUUID(), confirm: true });
}
async function reset() {
  if (busy || !confirm('この問題を最初から遊び直しますか？')) return;
  if (await mutate('reset', { runId: state.runId, requestId: crypto.randomUUID(), confirm: true })) { selected.clear(); order = undefined; intent = undefined; notice = ''; noticeKind = ''; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
}
function makeDialog(markup) {
  const trigger = document.activeElement;
  const dialog = document.createElement('dialog'); dialog.className = 'c-dialog'; dialog.innerHTML = markup;
  document.body.append(dialog); document.body.classList.add('c-dialog-open');
  dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.toggle('c-dialog-open', !!document.querySelector('dialog[open]')); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); dialog.showModal(); return dialog;
}
function showHelp() {
  const dialog = makeDialog('<div class="c-help-content"><h2>写真の繋がりを見つける</h2><p>12枚の写真から、共通点のある４枚を選びます。全部で３組です。</p><p>写真の右下の ⤢ で拡大でき、写っている物の名前も確認できます。正解すると、写真と図で関係が開きます。</p><p>１組100点。４回間違えると全解説が開きます。同じ組み合わせの再送で残り回数は減りません。</p><p>写真は生成したイメージです。固定１問の体験版で、途中で答えを見ることもできます。</p><button id="c-help-close">写真へ戻る</button></div>');
  dialog.querySelector('#c-help-close').onclick = () => dialog.close();
}
function showDiscovery(group, fresh) {
  const dialog = makeDialog(`<div class="c-discovery-top"><span>${fresh ? '繋がりを発見' : '繋がりの記録'}</span><strong>${fresh ? '+100' : '✓'}</strong></div>${groupView(group, true)}<button class="c-continue" id="c-discovery-close">${state.status === 'playing' ? '写真へ戻る' : '結果を見る'} →</button>`);
  dialog.classList.add('c-discovery'); attachViews(dialog);
  dialog.querySelector('#c-discovery-close').onclick = () => dialog.close();
  dialog.querySelector('#c-discovery-close').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function openPreview(id) {
  let index = state.tiles.findIndex(t => t.id === id);
  const dialog = makeDialog('<div class="c-preview-head"><span id="c-preview-number"></span><button id="c-preview-close">閉じる ×</button></div><div id="c-preview-photo"></div><div class="c-preview-caption"></div><div class="c-preview-controls"><button id="c-preview-prev" aria-label="前の写真">←</button><button id="c-preview-select"></button><button id="c-preview-next" aria-label="次の写真">→</button></div>');
  function update() {
    const tile = state.tiles[index]; dialog.querySelector('#c-preview-number').textContent = `写真 ${photoNumber(tile)}`;
    dialog.querySelector('#c-preview-photo').innerHTML = photo(tile);
    dialog.querySelector('.c-preview-caption').innerHTML = `<strong>${esc(tile.label)}</strong><span>${esc(tile.reading)}</span>${tile.imageNote ? `<p>${esc(tile.imageNote)}</p>` : ''}`;
    const select = dialog.querySelector('#c-preview-select'), solved = solvedIds().has(tile.id);
    select.textContent = solved ? '発見済み' : selected.has(tile.id) ? '選択を外す' : 'この写真を選ぶ';
    select.disabled = solved || busy || state.status !== 'playing' || !imageReady;
    select.onclick = () => { toggle(tile.id); update(); };
  }
  const move = step => { index = (index + step + state.tiles.length) % state.tiles.length; update(); };
  dialog.querySelector('#c-preview-prev').onclick = () => move(-1); dialog.querySelector('#c-preview-next').onclick = () => move(1);
  dialog.querySelector('#c-preview-close').onclick = () => dialog.close();
  dialog.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); } }); update();
}
const emoji = { sand: '🟨', moss: '🟩', violet: '🟪' };
function resultText() {
  return `異聞調査録｜繋がりのパズル ${state.fileNumber}\n${state.points} / ${state.maxPoints} 点・${state.groups.length} / ${state.totalGroups} 組\n${state.history.map(h => h.result === 'matched' ? (emoji[h.color] || '⬜').repeat(4) : '⬛⬛⬛⬛').join('\n')}\n${location.origin}/?mode=connections`;
}
async function copyResult() {
  try { await navigator.clipboard.writeText(resultText()); notice = '結果をコピーしました。'; render(); }
  catch {
    const dialog = makeDialog('<div class="c-help-content"><h2>結果をコピー</h2><textarea readonly aria-label="共有する結果"></textarea><button>閉じる</button></div>');
    const text = dialog.querySelector('textarea'); text.value = resultText(); text.focus(); text.select(); dialog.querySelector('button').onclick = () => dialog.close();
  }
}
async function saveResult() {
  if (busy) return;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0c0b0d'; ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = '#e58a80'; ctx.fillRect(80, 45, 40, 3);
  ctx.fillStyle = '#b6aaa8'; ctx.font = '30px sans-serif'; ctx.fillText(`異聞調査録 / FILE ${state.fileNumber}`, 80, 100);
  ctx.fillStyle = '#eee7e3'; ctx.font = 'bold 140px sans-serif'; ctx.fillText(String(state.points), 75, 280); ctx.font = '36px sans-serif'; ctx.fillText(`/ ${state.maxPoints} 点`, 390, 270);
  ctx.font = '32px sans-serif'; ctx.fillStyle = '#d2c5bf'; ctx.fillText(`${state.groups.length} / ${state.totalGroups} の繋がりを発見`, 80, 355);
  const colors = { sand: '#cbb38b', moss: '#a5b6a2', violet: '#b39bc8' };
  state.history.forEach((h, row) => { ctx.fillStyle = h.result === 'matched' ? colors[h.color] : '#363b3e'; for (let column = 0; column < 4; column++) ctx.fillRect(80 + column * 72, 405 + row * 36, 62, 26); });
  ctx.fillStyle = '#b6aaa8'; ctx.font = '25px sans-serif'; ctx.fillText(`${location.origin}/?mode=connections`, 80, 740);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { notice = '画像を作れませんでした。結果のコピーを利用できます。'; render(); return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `ibun-photos-${state.fileNumber}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function loadImage() {
  imageReady = false; imageFailed = false; render(); const img = new Image();
  img.onload = () => { imageReady = true; render(); }; img.onerror = () => { imageFailed = true; render(); }; img.src = state.imageUrl;
}
app.innerHTML = '<p class="c-start" role="status">写真を受信しています…</p>';
try { state = await api(); render(); loadImage(); }
catch { app.innerHTML = '<div class="c-start"><p>パズルを開けませんでした。</p><button onclick="location.reload()">もう一度読み込む</button></div>'; }
