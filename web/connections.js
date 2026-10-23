import './connections.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state, selected = new Set(), order, busy = false, notice = '', noticeKind = '', intent, dialogTrigger;
const tileById = id => state.tiles.find(t => t.id === id);
const solvedIds = () => new Set(state.groups.flatMap(g => g.tileIds));
const remaining = () => (order || state.tiles.map(t => t.id)).filter(id => !solvedIds().has(id));

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
  app.className = 'connections-app word-connections';
  app.innerHTML = `<header class="c-header"><a href="/?mode=connections">異聞調査録<span>繋がりのパズル</span></a><span>FILE ${esc(state.fileNumber)}</span><button id="c-help" aria-label="遊び方">？</button></header>
    <main><div class="c-heading"><div><p class="c-eyebrow">12 WORDS / 3 CONNECTIONS</p><h1>${esc(state.title)}</h1></div><p class="c-progress"><strong>${state.groups.length}</strong> / ${state.totalGroups}<span>繋がりを発見</span></p></div>
    ${!ended ? `<p class="c-instruction">共通点のある４語を選ぶ。</p><section class="c-grid" aria-label="12単語の盤面">${remaining().map(id => {
      const t = tileById(id), active = selected.has(id);
      return `<button class="c-word ${active ? 'is-selected' : ''}" data-tile="${id}" aria-label="${esc(t.label)}（${esc(t.reading)}）" aria-pressed="${active}" ${busy ? 'disabled' : ''}><span class="c-word-label">${esc(t.label)}</span><span class="c-reading">${esc(t.reading)}</span><span class="c-word-check" aria-hidden="true">${active ? '✓' : ''}</span></button>`;
    }).join('')}</section>` : ''}
    <p id="c-notice" class="c-notice ${esc(noticeKind)}" role="status" aria-live="polite">${esc(notice || (ended ? 'すべての解説を読めます。' : '４語ずつ、３つの組に分けてください。'))}</p>
    <div class="c-found" aria-label="見つけた繋がり">${state.groups.map(g => groupView(g)).join('')}</div>
    ${ended ? resultView() : `<div class="c-tools"><button id="c-shuffle" ${busy ? 'disabled' : ''}>並べ替える</button><button id="c-clear" ${busy || !selected.size ? 'disabled' : ''}>選択を外す</button><button id="c-reveal" ${busy ? 'disabled' : ''}>答えを見る</button></div>`}
    <footer class="c-footer"><p>${esc(state.fictionNote)}</p></footer></main>
    ${!ended ? `<div class="c-dock"><div class="c-dock-inner"><div class="c-lives" aria-label="残り${state.maxMistakes - state.mistakes}回"><span>残り</span>${Array.from({ length: state.maxMistakes }, (_, i) => `<i class="${i < state.maxMistakes - state.mistakes ? '' : 'spent'}" aria-hidden="true"></i>`).join('')}</div><button class="c-submit" id="c-submit" ${selected.size === state.groupSize && !busy ? '' : 'disabled'}>${busy ? '照合しています…' : `繋がりを確かめる <span>${selected.size} / ${state.groupSize}</span>`}</button></div></div>` : ''}`;
  document.querySelectorAll('[data-tile]').forEach(button => button.onclick = () => toggle(button.dataset.tile));
  document.querySelector('#c-submit')?.addEventListener('click', guess);
  document.querySelector('#c-clear')?.addEventListener('click', () => { selected.clear(); intent = undefined; notice = ''; noticeKind = ''; render(); });
  document.querySelector('#c-shuffle')?.addEventListener('click', shuffle);
  document.querySelector('#c-reveal')?.addEventListener('click', reveal);
  document.querySelector('#c-reset')?.addEventListener('click', reset);
  document.querySelector('#c-copy')?.addEventListener('click', copyResult);
  document.querySelector('#c-save')?.addEventListener('click', saveResult);
  document.querySelector('#c-help').onclick = showHelp;
  if (restore) document.querySelector(restore)?.focus({ preventScroll: true });
}
function groupView(group) {
  const matched = noticeKind === 'matched' && state.feedback?.title === group.title;
  return `<article class="c-group c-word-group ${esc(group.color)} ${group.found ? 'found' : 'unfound'} ${matched ? 'just-found' : ''}">
    <div class="c-word-group-heading"><span>${esc(group.difficulty)}${group.found ? '・発見' : '・未発見'}</span><h2>${esc(group.title)}</h2></div>
    <p class="c-group-words">${group.tileIds.map(id => esc(tileById(id).label)).join('・')}</p><p class="c-group-lead">${esc(group.lead)}</p>
    ${group.facts?.length ? `<dl class="c-facts">${group.facts.map(f => `<div><dt>${esc(f.from)}</dt><dd><span aria-hidden="true">→</span>${esc(f.to)}</dd></div>`).join('')}</dl>` : ''}
    <details class="c-group-more"><summary>背景を読む</summary><p>${esc(group.detail)}</p></details></article>`;
}
function resultView() {
  const heading = state.status === 'completed' ? '３つの繋がりを発見' : state.status === 'failed' ? '照合を終了しました' : '答えを公開しました';
  return `<section class="c-result" tabindex="-1"><p class="c-eyebrow">${heading}</p><div class="c-score"><strong>${state.points}</strong><span>/ ${state.maxPoints} 点</span></div>
    ${state.remainingGroups.length ? `<div class="c-remaining">${state.remainingGroups.map(g => groupView(g)).join('')}</div>` : ''}
    <h2>${esc(state.reveal.title)}</h2><p>${esc(state.reveal.story)}</p>
    <details class="c-sources"><summary>典拠・神話について <span>＋</span></summary><div><p>${esc(state.reveal.fiction)}</p><p>${esc(state.reveal.sourceNote)}</p>${state.reveal.sources.map(s => `<article><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><p>${esc(s.scope)}</p><small>${esc(s.status)}</small></article>`).join('')}</div></details>
    <div class="c-share"><button id="c-copy">結果をコピー</button><button id="c-save">結果画像を保存</button></div><p class="c-share-note">共有する結果に、単語と答えは載せません。</p><button id="c-reset" class="c-reset" ${busy ? 'disabled' : ''}>もう一度遊ぶ</button></section>`;
}
function toggle(id) {
  if (busy || state.status !== 'playing') return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < state.groupSize) selected.add(id);
  else { notice = '４語選択中です。別の語を選ぶには、一つ外してください。'; noticeKind = ''; render(); return; }
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
  if (busy || selected.size !== state.groupSize) return;
  const ids = [...selected], signature = ids.slice().sort().join(',');
  if (!intent || intent.signature !== signature || intent.runId !== state.runId) intent = { signature, runId: state.runId, requestId: crypto.randomUUID(), tileIds: ids };
  if (await mutate('guess', { runId: intent.runId, requestId: intent.requestId, tileIds: intent.tileIds })) { intent = undefined; render(); }
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
  dialogTrigger = document.activeElement?.id;
  const dialog = document.createElement('dialog'); dialog.className = 'c-dialog'; dialog.innerHTML = markup;
  document.body.append(dialog); document.body.classList.add('c-dialog-open');
  dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.remove('c-dialog-open'); if (dialogTrigger) document.getElementById(dialogTrigger)?.focus({ preventScroll: true }); });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); dialog.showModal(); return dialog;
}
function showHelp() {
  const dialog = makeDialog('<div class="c-help-content"><h2>４語の繋がりを見つける</h2><p>12語を、共通点のある４語ずつ、３組に分けます。４つ選んで「繋がりを確かめる」を押してください。</p><p>初級・中級・最難関の３組。正解すると、共通点と背景が開きます。</p><p>１組100点。４回間違えると全解説が開きます。同じ組み合わせの再送で残り回数は減りません。</p><p>漢字の下には読み仮名があります。途中で答えを見ることもできます。固定１問の体験版です。</p><button id="c-help-close">パズルへ戻る</button></div>');
  dialog.querySelector('#c-help-close').onclick = () => dialog.close();
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
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#101314'; ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = '#a8aaa2'; ctx.font = '30px sans-serif'; ctx.fillText(`異聞調査録 / FILE ${state.fileNumber}`, 80, 100);
  ctx.fillStyle = '#f0eee5'; ctx.font = 'bold 140px sans-serif'; ctx.fillText(String(state.points), 75, 280); ctx.font = '36px sans-serif'; ctx.fillText(`/ ${state.maxPoints} 点`, 390, 270);
  ctx.font = '32px sans-serif'; ctx.fillStyle = '#bfc1b4'; ctx.fillText(`${state.groups.length} / ${state.totalGroups} の繋がりを発見`, 80, 355);
  const colors = { sand: '#cbb38b', moss: '#a5b6a2', violet: '#b39bc8' };
  state.history.forEach((h, row) => { ctx.fillStyle = h.result === 'matched' ? colors[h.color] : '#363b3e'; for (let column = 0; column < 4; column++) ctx.fillRect(80 + column * 72, 405 + row * 36, 62, 26); });
  ctx.fillStyle = '#a8aaa2'; ctx.font = '25px sans-serif'; ctx.fillText(`${location.origin}/?mode=connections`, 80, 740);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { notice = '画像を作れませんでした。結果のコピーを利用できます。'; render(); return; }
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'ibun-words-002.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
app.innerHTML = '<p class="c-start" role="status">パズルを開いています…</p>';
try { state = await api(); render(); }
catch { app.innerHTML = '<div class="c-start"><p>パズルを開けませんでした。</p><button onclick="location.reload()">もう一度読み込む</button></div>'; }
