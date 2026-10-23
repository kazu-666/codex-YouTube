import './fieldwork.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state, choice, busy = false, error = '', intent, resultBlob, imageReady = false, imageFailed = false;
const slot = () => state.slots[0];
const answerLabel = value => slot().options.find(o => o.id === value)?.label;

async function api(action = 'state', body) {
  const r = await fetch(`/api/fieldwork/${action}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000) });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || '通信を確認して、もう一度お試しください。'), { state: data.state });
  return data;
}
function render() {
  app.className = 'message-app';
  app.style.setProperty('--message-photos', `url("${state.imageUrl}")`);
  app.innerHTML = `<header class="m-header"><a href="/?mode=fieldwork">異聞調査録</a><span>受信記録 <i>001</i></span><strong>${state.answer ? state.answer.points : '—'}<small> / 100</small></strong></header>
    <main><div class="m-case-heading"><p>FILE 001 <span>創作の受信記録・生成画像</span></p><h1>${esc(state.title)}</h1><p class="m-intro">${esc(state.intro)}</p></div>
    <div class="m-received"><span></span>３枚の写真が届いています</div>
    <section class="m-thread" aria-label="届いた写真とメッセージ">${state.scenes.map(s => `<article class="m-message"><div class="m-sender">資料提供者 <span>添付 ${s.number}</span></div><div class="m-photo m-panel-${s.panel}" role="img" aria-label="${esc(s.alt)}"></div><p class="m-message-text">${esc(s.message)}</p></article>`).join('')}</section>
    <p id="m-image-status" role="status" ${imageReady ? 'hidden' : ''}>${imageFailed ? '写真を読み込めませんでした。<button id="m-image-retry">再読み込み</button>' : '写真を読み込んでいます…'}</p>
    ${error ? `<p class="m-error" role="alert">${esc(error)}</p>` : ''}
    ${state.answer ? resultView() : questionView()}
    <p class="m-fiction">${esc(state.fictionNote)}</p></main><div class="m-toast" role="status" aria-live="polite"></div>`;
  document.querySelector('#m-image-retry')?.addEventListener('click', loadImage);
  if (state.answer) {
    document.querySelector('#m-replay').onclick = replay;
    document.querySelector('#m-copy').onclick = copyResult;
    document.querySelector('#m-save').onclick = saveResult;
    if (!resultBlob) {
      const answerId = state.answer.requestId;
      createResult().then(blob => { if (state.answer?.requestId !== answerId) return; resultBlob = blob; const b = document.querySelector('#m-save'); if (b) b.disabled = false; }).catch(() => toast('画像を作れませんでした。結果のコピーを利用できます。'));
    }
  } else {
    document.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
      if (busy) return;
      choice = b.dataset.choice; intent = undefined;
      document.querySelectorAll('[data-choice]').forEach(el => { const active = el.dataset.choice === choice; el.setAttribute('aria-pressed', String(active)); el.classList.toggle('is-selected', active); el.querySelector('i').textContent = active ? '✓' : ''; });
      document.querySelector('#m-submit').disabled = false;
    });
    document.querySelector('#m-submit').onclick = () => submit(false);
    document.querySelector('#m-skip').onclick = () => submit(true);
  }
}
function questionView() {
  return `<section class="m-question" aria-labelledby="m-question-title"><p class="m-eyebrow">あなたの考察</p><h2 id="m-question-title">${esc(state.question)}</h2>
    <div class="m-choices">${slot().options.map(o => `<button data-choice="${o.id}" aria-pressed="${choice === o.id}" class="${choice === o.id ? 'is-selected' : ''}"><i aria-hidden="true">${choice === o.id ? '✓' : ''}</i>${esc(o.label)}</button>`).join('')}</div>
    <button class="m-submit" id="m-submit" ${choice && !busy ? '' : 'disabled'}>${busy ? '保存しています…' : 'この考察で回答する →'}</button><div class="m-answer-note"><span>回答は１回。写真は何度でも見直せます。</span><button id="m-skip" ${busy ? 'disabled' : ''}>答えを見る</button></div></section>`;
}
function resultView() {
  const a = state.answer, r = state.reveal;
  return `<section class="m-result" id="m-result" tabindex="-1"><div class="m-verdict"><span>${a.words === null ? '答えを公開' : a.points === 100 ? '考察一致' : '答え合わせ'}</span><strong>${a.points}<small> / 100</small></strong></div>
    ${a.words && !a.points ? `<p class="m-your-answer">あなたの考察：${esc(answerLabel(a.words.purpose))}</p>` : ''}
    <h2>${esc(r.title)}</h2><p class="m-result-lead">${esc(r.lead)}</p>
    <details class="m-background"><summary>詳しい背景・実在の着想元を読む <span aria-hidden="true">＋</span></summary><div><h3>三枚の写真をつなげると</h3>${r.proofs.map(p => `<p>${esc(p.text)}</p>`).join('')}<p>${esc(r.story)}</p><h3>${esc(r.realTitle)}</h3><p>${esc(r.realStory)}</p><a href="${esc(r.source.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source.label)} ↗</a><p class="m-source-note">参照：${r.source.readAt}。伝承・信仰の紹介です。人物や出来事、写真の情景は創作です。</p></div></details>
    <div class="m-share"><button id="m-copy">結果をコピー</button><button id="m-save" ${resultBlob ? '' : 'disabled'}>結果画像を保存</button></div><p class="m-small">共有する文と画像に、答えは載せません。</p><button class="m-replay" id="m-replay">この一話をやり直す</button><p class="m-small">固定１話の試作です。</p></section>`;
}
async function submit(skip) {
  if (busy || !skip && !choice) return;
  if (skip && !confirm('考察は０点として記録し、答えと詳しい背景を公開しますか？')) return;
  const words = skip ? null : { purpose: choice };
  if (!intent || JSON.stringify(intent.words) !== JSON.stringify(words)) intent = { words, requestId: crypto.randomUUID() };
  busy = true; error = ''; render();
  try { state = await api('answer', intent); }
  catch (e) {
    if (e.state) state = e.state;
    else { try { state = await api(); } catch { /* Preserve the local selection and retry ID. */ } }
    if (!state.answer) error = e.name === 'TimeoutError' ? '保存の確認に時間がかかっています。もう一度お試しください。' : '通信を確認して、もう一度お試しください。';
  } finally { busy = false; render(); }
  if (state.answer) document.querySelector('#m-result').focus({ preventScroll: true });
}
async function replay() {
  if (busy || !confirm('この一話の考察を消して、最初から読みますか？')) return;
  busy = true;
  try { state = await api('reset', { confirm: true }); choice = undefined; intent = undefined; resultBlob = undefined; error = ''; busy = false; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  catch { toast('やり直しを保存できませんでした。通信を確認してください。'); }
  finally { busy = false; }
}
async function copyResult() {
  const text = `異聞調査録｜受信記録 001\n${state.answer.points} / 100 点\n写真とメッセージから、一つの物語を考察しました。\n${location.origin}/?mode=fieldwork`;
  try { await navigator.clipboard.writeText(text); toast('結果をコピーしました。'); }
  catch {
    const box = document.createElement('textarea'); box.value = text; box.setAttribute('aria-label', '共有する結果'); box.className = 'm-copy-fallback';
    document.querySelector('.m-result').append(box); box.focus(); box.select(); toast('表示した文を選択してコピーできます。');
  }
}
function saveResult() {
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob), a = document.createElement('a'); a.href = url; a.download = 'ibun-message-result.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function createResult() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
  const x = c.getContext('2d'); x.fillStyle = '#111316'; x.fillRect(0, 0, 1200, 630); x.strokeStyle = '#5d6166'; x.strokeRect(40, 40, 1120, 550);
  x.fillStyle = '#d8d9d6'; x.font = '30px sans-serif'; x.fillText('異聞調査録 / 受信記録 001', 85, 120);
  x.fillStyle = '#f2f0e9'; x.font = 'bold 150px sans-serif'; x.fillText(String(state.answer.points), 80, 335); x.font = '36px sans-serif'; x.fillStyle = '#aaaeb3'; x.fillText('/ 100 点', 420, 330);
  x.fillStyle = '#b7b4ac'; x.font = '32px sans-serif'; x.fillText('写真とメッセージから、一つの物語を考察する。', 85, 480);
  return new Promise((resolve, reject) => c.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像作成失敗')), 'image/png'));
}
function toast(message) { const e = document.querySelector('.m-toast'); e.textContent = message; clearTimeout(toast.timer); toast.timer = setTimeout(() => { e.textContent = ''; }, 3500); }
function loadImage() {
  imageReady = false; imageFailed = false;
  const img = new Image();
  img.onload = () => { imageReady = true; document.querySelector('#m-image-status')?.setAttribute('hidden', ''); };
  img.onerror = () => { imageFailed = true; render(); };
  img.src = state.imageUrl;
}
app.innerHTML = '<p class="m-start" role="status">受信記録を開いています…</p>';
try { state = await api(); render(); loadImage(); }
catch { app.innerHTML = '<div class="m-start"><p>受信記録を開けませんでした。</p><button onclick="location.reload()">もう一度読み込む</button></div>'; }
