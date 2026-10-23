import './connections.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state, selected = new Set(), order, busy = false, notice = '', noticeKind = '', intent, imageReady = false, imageFailed = false;
let previewIndex = 0, previewTrigger, resultBlob;
const tileById = id => state.tiles.find(t => t.id === id);
const solvedIds = () => new Set(state.groups.flatMap(g => g.tileIds));
const remaining = () => (order || state.tiles.map(t => t.id)).filter(id => !solvedIds().has(id));
const position = t => `background-position:${(t.panel % 4) * 100 / 3}% ${Math.floor(t.panel / 4) * 100 / 3}%`;
const number = t => String(t.panel + 1).padStart(2, '0');
const photo = (t, cls = '') => `<span class="c-photo ${cls}" role="img" aria-label="${esc(t.alt)}" style="${position(t)}"></span>`;

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
  const restore = focused?.closest('#app') ? focused.dataset.tile ? `[data-tile="${focused.dataset.tile}"]` : focused.dataset.preview ? `[data-preview="${focused.dataset.preview}"]` : focused.id ? `#${focused.id}` : undefined : undefined;
  const ended = state.status !== 'playing', available = remaining();
  app.className = 'connections-app';
  document.documentElement.style.setProperty('--received-photos', `url("${state.imageUrl}")`);
  app.innerHTML = `<header class="c-header"><a href="/?mode=connections">異聞調査録<span>受信記録</span></a><span>FILE ${esc(state.fileNumber)}</span><button id="c-help" aria-label="遊び方">？</button></header>
    <main><div class="c-heading"><div><p class="c-eyebrow">16 PHOTOGRAPHS / 4 CONNECTIONS</p><h1>${esc(state.title)}</h1></div><p class="c-progress"><strong>${state.groups.length}</strong> / ${state.totalGroups}<span>繋がりを発見</span></p></div>
    <p class="c-instruction">つながる写真を４枚選ぶ。</p>
    <div id="c-image-status" class="c-image-status" role="status" ${imageReady ? 'hidden' : ''}>${imageFailed ? '写真を読み込めませんでした。<button id="c-image-retry">再読み込み</button>' : '写真を受信しています…'}</div>
    <div class="c-found" aria-label="見つけた繋がり">${state.groups.map(g => groupView(g)).join('')}</div>
    ${!ended && available.length ? `<section class="c-grid ${imageFailed ? 'image-failed' : ''}" aria-label="届いた写真">${available.map(id => {
      const t = tileById(id), active = selected.has(id);
      return `<div class="c-tile ${active ? 'is-selected' : ''}"><button class="c-select" data-tile="${id}" aria-label="写真 ${number(t)}を選ぶ" aria-pressed="${active}" ${busy || !imageReady ? 'disabled' : ''}>${photo(t)}<span class="c-photo-number">${number(t)}</span><span class="c-check" aria-hidden="true">${active ? '✓' : ''}</span></button><button class="c-enlarge" data-preview="${id}" aria-label="写真 ${number(t)}を拡大" ${!imageReady ? 'disabled' : ''}>⤢</button></div>`;
    }).join('')}</section>` : ''}
    <p id="c-notice" class="c-notice ${esc(noticeKind)}" role="status" aria-live="polite">${esc(notice || (ended ? '答え合わせを開きました。' : '写真の右下の ⤢ で、大きく見られます。'))}</p>
    ${ended ? resultView() : `<div class="c-tools"><button id="c-shuffle" ${busy ? 'disabled' : ''}>並べ替える</button><button id="c-clear" ${busy || !selected.size ? 'disabled' : ''}>選択を外す</button><button id="c-reveal" ${busy ? 'disabled' : ''}>答えを見る</button></div>`}
    <footer class="c-footer"><p>${esc(state.fictionNote)}</p><p>固定１話の試作です。</p></footer>
    </main>${!ended ? `<div class="c-dock"><div class="c-dock-inner"><div class="c-lives" aria-label="残り${state.maxMistakes - state.mistakes}回"><span>残り</span>${Array.from({ length: state.maxMistakes }, (_, i) => `<i class="${i < state.maxMistakes - state.mistakes ? '' : 'spent'}" aria-hidden="true"></i>`).join('')}</div><button class="c-submit" id="c-submit" ${selected.size === state.groupSize && !busy && imageReady ? '' : 'disabled'}>${busy ? '照合しています…' : `繋がりを確かめる <span>${selected.size} / ${state.groupSize}</span>`}</button></div></div>` : ''}`;
  document.querySelectorAll('[data-tile]').forEach(button => button.onclick = () => toggle(button.dataset.tile));
  document.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => openPreview(button.dataset.preview, button));
  document.querySelector('#c-submit')?.addEventListener('click', guess);
  document.querySelector('#c-clear')?.addEventListener('click', () => { selected.clear(); intent = undefined; notice = ''; render(); });
  document.querySelector('#c-shuffle')?.addEventListener('click', shuffle);
  document.querySelector('#c-reveal')?.addEventListener('click', reveal);
  document.querySelector('#c-reset')?.addEventListener('click', reset);
  document.querySelector('#c-copy')?.addEventListener('click', copyResult);
  document.querySelector('#c-save')?.addEventListener('click', saveResult);
  document.querySelector('#c-help').onclick = showHelp;
  document.querySelector('#c-image-retry')?.addEventListener('click', loadImage);
  if (restore) document.querySelector(restore)?.focus({ preventScroll: true });
}
function groupView(group) {
  return `<details class="c-group ${esc(group.color)} ${group.found ? 'found' : 'unfound'} ${noticeKind === 'matched' && state.feedback?.title === group.title ? 'just-found' : ''}"><summary><span class="c-group-photos">${group.tileIds.map(id => photo(tileById(id))).join('')}</span><span><small>${group.found ? '繋がりを発見' : '未発見の繋がり'}</small><strong>${esc(group.title)}</strong></span><span class="c-plus" aria-hidden="true">＋</span></summary><div class="c-group-detail"><p>${esc(group.lead)}</p><p>${esc(group.detail)}</p><div>${group.tileIds.map(id => `<button data-preview="${id}" aria-label="写真 ${number(tileById(id))}を拡大">${photo(tileById(id))}</button>`).join('')}</div></div></details>`;
}
function resultView() {
  const heading = state.status === 'completed' ? '４つの繋がりを発見' : state.status === 'failed' ? '照合を終了しました' : '記録を公開しました';
  return `<section class="c-result" tabindex="-1"><p class="c-eyebrow">${heading}</p><div class="c-score"><strong>${state.points}</strong><span>/ ${state.maxPoints} 点</span></div>
    ${state.remainingGroups.length ? `<div class="c-remaining">${state.remainingGroups.map(g => groupView(g)).join('')}</div>` : ''}
    <h2>${esc(state.reveal.title)}</h2><p>${esc(state.reveal.story)}</p>
    <details class="c-sources"><summary>実在の着想元・この物語について <span>＋</span></summary><div><p>${esc(state.reveal.fiction)}</p><p>${esc(state.reveal.sourceNote)}</p>${state.reveal.sources.map(s => `<article><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><p>${esc(s.scope)}</p><small>本文確認：${esc(s.checkedAt)}</small></article>`).join('')}</div></details>
    <div class="c-share"><button id="c-copy">結果をコピー</button><button id="c-save">結果画像を保存</button></div><p class="c-share-note">共有する結果に、写真と答えは載せません。</p><button id="c-reset" class="c-reset" ${busy ? 'disabled' : ''}>もう一度遊ぶ</button></section>`;
}
function toggle(id) {
  if (busy || state.status !== 'playing') return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < state.groupSize) selected.add(id);
  else { notice = '４枚選択中です。別の写真を選ぶには、一枚外してください。'; noticeKind = ''; render(); return; }
  intent = undefined; notice = ''; noticeKind = ''; render();
}
function shuffle() {
  if (busy) return;
  order ||= state.tiles.map(t => t.id);
  for (let i = order.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  render();
}
async function mutate(action, body) {
  const oldHistory = state.history.length, oldRun = state.runId;
  busy = true; notice = ''; render();
  try {
    state = await api(action, body);
    notice = state.feedback?.message || ''; noticeKind = state.feedback?.kind || '';
    return true;
  } catch (error) {
    if (error.snapshot) state = error.snapshot;
    else { try { state = await api(); } catch { /* Keep selection and request ID for a safe retry. */ } }
    if (state.runId !== oldRun) { selected.clear(); order = undefined; intent = undefined; }
    const committed = state.history.length > oldHistory || action === 'reveal' && state.status !== 'playing' || action === 'reset' && state.runId !== oldRun;
    notice = committed ? '保存された照合結果を復元しました。' : error.message;
    noticeKind = committed ? 'restored' : 'error';
    return committed;
  } finally {
    busy = false;
    const found = solvedIds(); selected = new Set([...selected].filter(id => !found.has(id)));
    render();
  }
}
async function guess() {
  if (busy || selected.size !== state.groupSize || !imageReady) return;
  const ids = [...selected], signature = ids.slice().sort().join(',');
  if (!intent || intent.signature !== signature || intent.runId !== state.runId) intent = { signature, runId: state.runId, requestId: crypto.randomUUID(), tileIds: ids };
  const done = await mutate('guess', { runId: intent.runId, requestId: intent.requestId, tileIds: intent.tileIds });
  if (done) { intent = undefined; if (noticeKind === 'matched') selected.clear(); render(); }
}
async function reveal() {
  if (busy || !confirm('残りの繋がりを公開しますか？ 見つけた分の点数を記録します。')) return;
  await mutate('reveal', { runId: state.runId, requestId: crypto.randomUUID(), confirm: true });
}
async function reset() {
  if (busy || !confirm('この記録を最初から遊び直しますか？')) return;
  const done = await mutate('reset', { runId: state.runId, requestId: crypto.randomUUID(), confirm: true });
  if (done) { selected.clear(); order = undefined; intent = undefined; resultBlob = undefined; notice = ''; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
}
function makeDialog(markup) {
  const dialog = document.createElement('dialog'); dialog.className = 'c-dialog'; dialog.innerHTML = markup;
  document.body.append(dialog); document.body.classList.add('c-dialog-open');
  dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.remove('c-dialog-open'); const target = previewTrigger?.dataset.preview ? document.querySelector(`[data-preview="${previewTrigger.dataset.preview}"]`) : previewTrigger?.id ? document.getElementById(previewTrigger.id) : undefined; target?.focus({ preventScroll: true }); });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); dialog.showModal(); return dialog;
}
function openPreview(id, trigger) {
  previewTrigger = trigger;
  previewIndex = state.tiles.findIndex(t => t.id === id);
  const dialog = makeDialog('<div class="c-preview-head"><span id="c-preview-number"></span><button id="c-preview-close" aria-label="拡大写真を閉じる">閉じる ×</button></div><div id="c-preview-photo"></div><div class="c-preview-controls"><button id="c-preview-prev" aria-label="前の写真">←</button><button id="c-preview-select"></button><button id="c-preview-next" aria-label="次の写真">→</button></div>');
  function update() {
    const tile = state.tiles[previewIndex];
    dialog.querySelector('#c-preview-number').textContent = `写真 ${number(tile)}`;
    dialog.querySelector('#c-preview-photo').innerHTML = photo(tile);
    const select = dialog.querySelector('#c-preview-select'), solved = solvedIds().has(tile.id);
    select.textContent = solved ? '発見済み' : selected.has(tile.id) ? '選択を外す' : 'この写真を選ぶ';
    select.disabled = solved || state.status !== 'playing' || busy;
    select.onclick = () => { toggle(tile.id); update(); };
  }
  const move = step => { previewIndex = (previewIndex + step + state.tiles.length) % state.tiles.length; update(); };
  dialog.querySelector('#c-preview-prev').onclick = () => move(-1); dialog.querySelector('#c-preview-next').onclick = () => move(1);
  dialog.querySelector('#c-preview-close').onclick = () => dialog.close();
  dialog.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } });
  update();
}
function showHelp() {
  previewTrigger = document.querySelector('#c-help');
  const dialog = makeDialog('<div class="c-help-content"><h2>写真の繋がりを見つける</h2><p>16枚の写真から、共通点のある４枚を選び、照合します。全部で４組です。</p><p>一組見つけると100点。４回間違えると答え合わせになります。同じ組み合わせの再送では回数は減りません。</p><p>⤢ で写真を拡大できます。名前や風習を知っている必要はありません。写っている物や加工を見比べてください。</p><p>途中で「答えを見る」を押しても、背景まで読めます。固定１話の試作で、日替わりではありません。</p><button id="c-help-close">写真を見る</button></div>');
  dialog.querySelector('#c-help-close').onclick = () => dialog.close();
}
const emoji = { sand: '🟨', moss: '🟩', slate: '🟦', rust: '🟪' };
function resultText() {
  return `異聞調査録｜受信記録 ${state.fileNumber}\n${state.points} / ${state.maxPoints} 点・${state.groups.length} / ${state.totalGroups} 組\n${state.history.map(h => h.result === 'matched' ? (emoji[h.color] || '⬜').repeat(4) : '⬛⬛⬛⬛').join('\n')}\n${location.origin}/?mode=connections`;
}
async function copyResult() {
  try { await navigator.clipboard.writeText(resultText()); notice = '結果をコピーしました。'; }
  catch {
    const dialog = makeDialog('<div class="c-help-content"><h2>結果をコピー</h2><textarea id="c-copy-text" readonly aria-label="共有する結果"></textarea><button id="c-copy-close">閉じる</button></div>');
    const text = dialog.querySelector('textarea'); text.value = resultText(); text.focus(); text.select(); dialog.querySelector('button').onclick = () => dialog.close();
    return;
  }
  render();
}
async function saveResult() {
  if (busy) return;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101314'; ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = '#a8aaa2'; ctx.font = '30px sans-serif'; ctx.fillText(`異聞調査録 / FILE ${state.fileNumber}`, 80, 100);
  ctx.fillStyle = '#f0eee5'; ctx.font = 'bold 140px sans-serif'; ctx.fillText(String(state.points), 75, 280); ctx.font = '36px sans-serif'; ctx.fillText(`/ ${state.maxPoints} 点`, 390, 270);
  ctx.font = '32px sans-serif'; ctx.fillStyle = '#bfc1b4'; ctx.fillText(`${state.groups.length} / ${state.totalGroups} の繋がりを発見`, 80, 355);
  const colors = { sand: '#cbb38b', moss: '#a5b6a2', slate: '#9aadb8', rust: '#b38f86' };
  state.history.forEach((h, row) => { ctx.fillStyle = h.result === 'matched' ? colors[h.color] : '#363b3e'; for (let column = 0; column < 4; column++) ctx.fillRect(80 + column * 72, 405 + row * 36, 62, 26); });
  ctx.fillStyle = '#a8aaa2'; ctx.font = '25px sans-serif'; ctx.fillText(`${location.origin}/?mode=connections`, 80, 740);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { notice = '画像を作れませんでした。結果のコピーを利用できます。'; render(); return; }
  resultBlob = blob;
  const url = URL.createObjectURL(resultBlob), link = document.createElement('a'); link.href = url; link.download = 'ibun-connections-001.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function loadImage() {
  imageReady = false; imageFailed = false; render();
  const image = new Image(); image.onload = () => { imageReady = true; render(); }; image.onerror = () => { imageFailed = true; render(); }; image.src = state.imageUrl;
}
app.innerHTML = '<p class="c-start" role="status">写真を受信しています…</p>';
try { state = await api(); render(); loadImage(); }
catch { app.innerHTML = '<div class="c-start"><p>記録を開けませんでした。</p><button onclick="location.reload()">もう一度読み込む</button></div>'; }
