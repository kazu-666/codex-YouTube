import { recordMap } from './casebook-map.js';
import { shareText, shareImage, downloadResult } from './casebook-share.js';
import './casebook.css';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let state, index = 0, page = 'question', selected = {}, activeSlot = 'who', showScene = false, busy = false, error = '', newRecord = null, request = null, shareBlob = null;
const current = () => state.cases[index];
const phase = c => c.recorded ? 'location' : c.answer ? 'answer' : 'question';
const letters = ['A', 'B', 'C'];
const shareUrl = () => `${location.origin}/?mode=casebook`;

async function api(action = 'state', body) {
  const response = await fetch(`/api/casebook/${action}`, { method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '通信を確認して、もう一度お試しください。'), { state: data.state });
  return data;
}
async function mutate(action, payload) {
  if (busy) return false;
  busy = true; error = '';
  document.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
  app.setAttribute('aria-busy', 'true');
  try {
    state = await api(action, payload); busy = false; app.removeAttribute('aria-busy');
    if (['question', 'answer', 'location'].includes(page)) page = phase(current());
    render(); return true;
  } catch (e) {
    let recovered = false;
    if (e.state) { state = e.state; page = phase(current()); }
    else {
      // A lost response may already have committed. Reconcile without re-scoring.
      try { state = await api(); page = phase(current()); recovered = true; } catch { /* Keep the readable local state. */ }
    }
    const c = current();
    const saved = recovered && (action === 'record' && c.recorded || action === 'options' && c.optionsOpened || action === 'evidence' && c.opened.includes(payload.clueId) || action === 'answer' && c.answer && sameWords(c.answer.words, payload.words));
    if (saved) { busy = false; app.removeAttribute('aria-busy'); render(); return true; }
    error = e.name === 'TimeoutError' ? '通信に時間がかかっています。保存状況を確認し、もう一度お試しください。' : e instanceof TypeError ? '通信を確認して、もう一度お試しください。' : e.message;
    busy = false; app.removeAttribute('aria-busy'); render(); return false;
  }
}
function sameWords(a, b) { return a === null || b === null ? a === b : a && b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]); }
function scrollTop() { window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('h1')?.focus({ preventScroll: true }); }
function goCurrent() {
  index = Math.min(state.currentIndex, state.cases.length - 1);
  page = state.completed ? 'summary' : phase(current());
  selected = {}; activeSlot = 'who'; showScene = false; newRecord = null; error = ''; render(); scrollTop();
}
function goRecord(id) {
  const i = state.cases.findIndex(c => c.id === id && c.recorded); if (i < 0) return;
  index = i; page = 'location'; newRecord = null; selected = {}; render(); scrollTop();
}
function header() {
  return `<header class="book-header"><a class="book-brand" href="/?mode=casebook"><span class="brand-seal" aria-hidden="true">異</span><span>異聞調査録<small>考察デモ · ３話</small></span></a><nav><button id="book-help" aria-label="遊び方">?</button><button id="book-map" class="map-toggle">${page === 'collection' ? '調査へ戻る' : `調査地図 <span>${state.collection.length}</span>`}</button></nav></header>`;
}
function progress() {
  return `<div class="book-progress"><div class="case-steps" aria-label="３話の進行">${state.cases.map((c, i) => `<button data-case="${i}" aria-label="第${i + 1}話${c.recorded ? 'の記録' : ''}" ${c.locked ? 'disabled' : ''} aria-current="${i === index ? 'step' : 'false'}" class="${c.recorded ? 'done' : ''}">${c.recorded ? '✓' : i + 1}</button>`).join('')}</div><span>合計 <strong>${state.total}</strong><small> / ${state.maxTotal}点</small></span></div>`;
}
function clueButton(c, clue, compact = false) {
  const opened = c.opened.includes(clue.id);
  return `<button class="evidence-button ${compact ? 'compact' : ''} ${opened ? 'opened' : ''}" data-clue="${clue.id}" aria-haspopup="dialog"><span class="evidence-label">手がかり ${clue.id === 'a' ? '01' : '02'} <i>${opened ? '開封済み' : '未開封'}</i></span><span class="evidence-title">${esc(clue.title)}</span>${compact ? '' : `<span class="little-envelope" aria-hidden="true"></span><span class="evidence-open">${opened ? '読み返す' : '資料を開く'} ↗</span>`}</button>`;
}
function scene(c) {
  return `<figure class="case-scene"><img src="${c.sceneUrl}" alt="${esc(c.sceneAlt)}" width="1000" height="560"><figcaption>伝承をもとにした再現イラスト</figcaption></figure>`;
}
function reportSentence(c, words, solved = false) {
  return `<div class="report-sentence">${c.report.slots.map((slot, i) => {
    const value = words?.[slot.id], option = slot.options.find(x => x.id === value);
    const text = option?.label || slot.label;
    return `${esc(c.report.parts[i])}${solved ? `<strong class="solved-word">${esc(text)}</strong>` : `<button class="report-blank ${value ? 'filled' : ''} ${activeSlot === slot.id ? 'active' : ''}" data-slot="${slot.id}" aria-label="${esc(slot.label)}、${value ? esc(text) : '未記入'}">${esc(text)}<small>${value ? '変更' : '選ぶ'}</small></button>`}`;
  }).join('')}${esc(c.report.parts.at(-1))}</div>`;
}
function questionMarkup(c) {
  const choosing = c.optionsOpened && !showScene;
  const slot = c.report?.slots.find(x => x.id === activeSlot) || c.report?.slots[0];
  const ready = c.report?.slots.every(x => selected[x.id]);
  return `${progress()}<section class="case-heading"><p class="kicker">第${c.number}話 <span>手がかりから、背景を考える</span></p><h1 tabindex="-1">${esc(c.title)}</h1>${choosing ? '' : `<p class="case-intro">${esc(c.intro)}</p>`}</section>${choosing ? '' : scene(c)}<section class="evidence-section ${choosing ? 'choosing' : ''}" aria-label="考察の手がかり"><div class="section-label"><span>調査資料</span><small>いつでも無料で読めます</small></div><div class="evidence-grid">${c.clues.map(clue => clueButton(c, clue, choosing)).join('')}</div></section>${choosing ? `<section class="choice-section" id="choices"><p class="kicker">あなたの調査報告書</p><h2>${esc(c.question)}</h2><p class="choice-note">２つの空欄を、言葉をタップして埋めよう。</p>${reportSentence(c, selected)}<div class="word-bank"><div class="word-bank-label"><span>${esc(slot.label)}を選ぶ</span><small>${Object.keys(selected).length} / 2 記入</small></div>${slot.options.map((option, i) => `<button class="word-option ${selected[slot.id] === option.id ? 'selected' : ''}" data-word="${option.id}" data-for-slot="${slot.id}" aria-pressed="${selected[slot.id] === option.id}"><span class="choice-letter">${letters[i]}</span><span>${esc(option.label)}</span><i aria-hidden="true"></i></button>`).join('')}</div><button class="quiet-button" id="review-situation">状況のイラストと文章を見直す ↗</button><button class="skip-case" id="skip-case">回答を見送り、解説を読む（0点）</button></section><div class="bottom-action"><button class="book-primary" id="submit-case" ${!ready ? 'disabled' : ''}>この報告書で確定する <span>→</span></button></div>` : `<section class="question-preview"><span>考えること</span><h2>${esc(c.question)}</h2></section><div class="bottom-action"><button class="book-primary" id="show-choices">${c.optionsOpened ? '報告書に戻る' : '調査報告書を開く'} <span>→</span></button></div>`}<p class="demo-footnote">固定３話の体験版。毎日の新問配信は準備中です。</p>`;
}
function answerMarkup(c) {
  const a = c.answer, text = a.words === null ? '回答を見送りました' : a.correct ? '考察がつながりました' : a.matched ? '一部の関係がつながりました' : '別の答えが見えてきました';
  const feedback = a.words === null ? '回答を見送っても、この話と土地の記録は残せます。' : a.correct ? '２つの手がかりが、一つの報告書につながりました。' : '資料が示す人物と目的を、もう一度つないでみましょう。';
  return `${progress()}<section class="answer-heading"><p class="kicker">第${c.number}話 · 答え合わせ</p><div class="answer-verdict"><span class="verdict-symbol ${a.correct ? 'correct' : ''}" aria-hidden="true">${a.correct ? '✦' : '◇'}</span><h1 tabindex="-1">${text}</h1><strong>+${a.points}<small>点</small></strong></div><p class="answer-choice-label">資料からつながる報告書</p>${reportSentence(c, a.solution, true)}${a.words ? `<div class="submitted-words"><span>あなたの記入 ${a.matched} / 2一致</span>${c.report.slots.map(slot => `<p class="${a.words[slot.id] === a.solution[slot.id] ? 'matched' : ''}">${a.words[slot.id] === a.solution[slot.id] ? '✓' : '◇'} ${esc(slot.label)}：${esc(slot.options.find(x => x.id === a.words[slot.id]).label)}</p>`).join('')}</div>` : ''}<p class="answer-feedback">${feedback}</p></section><section class="proof-section"><div class="section-label"><span>手がかりが、つながる。</span></div>${a.explanation.proof.map((proof, i) => `<article class="proof-card" style="--delay:${i * 120}ms"><span>0${i + 1}</span><div><strong>${esc(c.clues.find(x => x.id === proof.clueId).key)}</strong><p>${esc(proof.text)}</p></div></article>`).join('')}</section><article class="full-story"><p class="kicker">この話の背景</p><h2>${esc(a.explanation.heading)}</h2><p class="story-lead">${esc(a.explanation.lead)}</p>${a.explanation.sections.map(section => `<section><h3>${esc(section.title)}</h3><p>${esc(section.body)}</p></section>`).join('')}</article><div class="region-tease"><span class="region-tease-mark" aria-hidden="true">⌖</span><div><strong>この話は、どこの土地へつながる？</strong><p>出典と、その場所を調査録に残します。</p></div></div><div class="bottom-action"><button class="book-primary" id="reveal-region">${c.recorded ? '土地の記録へ戻る' : 'この話の土地を知る'} <span>→</span></button></div>`;
}

function sources(c) {
  return `<details class="source-details"><summary>出典と確認した内容 <span>↗</span></summary>${c.sources.map(s => `<article><a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><p>${esc(s.scope)}</p><small>本文参照：${s.readAt} 日本時間</small></article>`).join('')}<p class="source-note">体験版の編集原稿です。史実・神話・伝承を区別して紹介し、公開前の最終照合を続けています。</p></details>`;
}
function locationMarkup(c) {
  return `${progress()}<section class="location-heading ${newRecord === c.id ? 'just-recorded' : ''}"><p class="kicker">この話が伝わる土地</p><h1 tabindex="-1">${esc(c.location.prefecture)}<small>${esc(c.location.area)}</small></h1><p class="place-name">${esc(c.location.place)}</p><span class="record-stamp">${newRecord === c.id ? '新しい土地を記録' : '調査録に記録済み'} ✓</span></section>${recordMap(state.collection, { activeId: c.id, newId: newRecord })}<section class="place-note"><span class="source-kind">${esc(c.sourceKind)}</span><p>${esc(c.location.note)}</p><button class="inline-button" id="reread-story">物語と考察を読み返す ↗</button></section><details class="aerial-details"><summary>この場所の周辺を、航空写真で見る <span>↗</span></summary><figure><img data-photo-src="${c.location.photoUrl}" alt="${esc(c.location.place)}周辺の航空写真" width="1000" height="625" loading="lazy"><p class="photo-failure" hidden>写真を読み込めませんでした。物語と出典はそのまま読めます。</p><figcaption>実際の周辺航空写真。撮影日は地点ごとに未確認です。<br>Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community</figcaption></figure></details>${sources(c)}<div class="bottom-action"><button class="book-primary" id="next-case">${index === state.cases.length - 1 ? '３話の結果を見る' : '次の話を調査する'} <span>→</span></button></div>`;
}
function collectionMarkup() {
  return `<section class="collection-heading"><p class="kicker">あなたの調査録</p><h1 tabindex="-1">物語が、土地につながる。</h1><p>${state.collection.length ? `${state.collection.length}件の記録。ピンやカードから、いつでも読み返せます。` : '調査を進めると、ここに土地の記録が増えていきます。'}</p></section>${recordMap(state.collection)}<section class="record-list">${state.collection.map((r, i) => `<button class="record-card" data-record="${r.id}"><span class="record-number">0${i + 1}</span><span><small>${esc(r.prefecture)}・${esc(r.area)}</small><strong>${esc(r.place)}</strong><em>${esc(r.title)}</em></span><span class="record-arrow">↗</span></button>`).join('')}</section><div class="bottom-action"><button class="book-primary" id="resume-case">${state.completed ? '３話の結果へ' : '調査の続きへ'} <span>→</span></button></div>`;
}
function summaryMarkup() {
  const correct = state.cases.filter(c => c.answer.correct).length;
  return `<section class="summary-heading"><p class="kicker">３つの調査を終えました</p><h1 tabindex="-1">知らなかった話が、<br>地図に残りました。</h1><div class="summary-score">${state.total}<span> / ${state.maxTotal} 点</span></div><div class="summary-stats"><span><strong>${correct}</strong> / 3問正解</span><span><strong>${state.collection.length}</strong>件の土地を記録</span></div></section><section class="summary-records">${state.collection.map((r, i) => `<button data-record="${r.id}"><span>0${i + 1}</span><div><small>${esc(r.prefecture)}</small><strong>${esc(r.place)}</strong></div><em>${r.points ? '+' + r.points + '点' : '記録済み'}</em><span>↗</span></button>`).join('')}</section><section class="book-share"><p class="kicker">調査の成果を共有する</p><p>投稿画像には、正解や地域名を載せません。</p><img id="book-share-preview" alt="３話の点数と正解状況を載せた投稿用画像" width="1200" height="630" hidden><button class="book-primary" id="share-casebook" disabled>点数画像を共有する <span>↗</span></button><div class="share-secondary"><button id="save-casebook" disabled>画像を保存</button><button id="copy-casebook">投稿文をコピー</button></div><p id="share-status" role="status" aria-live="polite">画像を準備しています…</p></section>${state.plan === 'free' ? '<aside class="book-ad" aria-label="広告スペース">広告スペース</aside>' : ''}<p class="demo-footnote">固定３話の体験版です。進行はこのブラウザに保存されます。<br>サーバー再起動時には記録が消える場合があります。</p><div class="bottom-action"><button class="book-primary" id="summary-map">調査地図を開く <span>→</span></button></div>`;
}
function render() {
  const content = page === 'collection' ? collectionMarkup() : page === 'summary' ? summaryMarkup() : page === 'answer' ? answerMarkup(current()) : page === 'location' ? locationMarkup(current()) : questionMarkup(current());
  document.title = '異聞調査録｜手がかりをつないで、土地を知る';
  app.innerHTML = `<div class="casebook">${header()}<main>${error ? `<p class="book-error" role="alert">${esc(error)}</p>` : ''}${content}</main><dialog id="evidence-modal" class="evidence-modal" aria-labelledby="evidence-title"></dialog><dialog id="help-modal" class="help-modal" aria-labelledby="help-title"><div class="modal-top"><span>遊び方</span><button data-close-help aria-label="閉じる">閉じる ×</button></div><h2 id="help-title">考察して、土地を知る。</h2><ol><li>短い出来事を読み、２枚の手がかりを開く。</li><li>言葉をタップし、報告書の２つの空欄を埋めて確定。回答は一度、１カ所50点・各話100点です。手がかりを読んでも減点しません。</li><li>答えと背景を読んだ後、その土地が明かされます。不正解でも、地図に記録が残ります。</li></ol><p>全３話の固定デモです。画像は再現イラストで、実際の記録写真ではありません。</p><button class="book-primary" data-close-help>調査に戻る →</button></dialog></div>`;
  bind();
  if (page === 'summary') prepareShare();
}
function showEvidence(clue, isNew) {
  const dialog = document.querySelector('#evidence-modal');
  const back = document.querySelector(`[data-clue="${clue.id}"]`);
  dialog.innerHTML = `<div class="modal-top"><span>調査資料 ${clue.id === 'a' ? '01' : '02'}</span><button id="close-evidence" aria-label="資料を閉じる">閉じる ×</button></div><div class="opening-art" aria-hidden="true"><div class="opening-ring"></div><div class="paper-envelope"><div class="paper-sheet"><i></i><i></i><i></i></div><div class="paper-pocket"></div><div class="paper-flap"></div><span class="paper-seal">調査資料</span></div></div><div class="evidence-paper"><p class="kicker">${isNew ? '手がかりを開封' : '手がかりを読み返す'}</p><h2 id="evidence-title">${esc(clue.title)}</h2><p>${esc(clue.body)}</p></div><button class="book-primary" id="continue-thinking">この手がかりで考える <span>→</span></button>`;
  dialog.dataset.new = String(isNew); dialog.showModal();
  dialog.querySelector('#close-evidence').onclick = dialog.querySelector('#continue-thinking').onclick = () => dialog.close();
  dialog.onclose = () => back?.focus({ preventScroll: true });
}
async function openClue(id) {
  const wasOpened = current().opened.includes(id) || !!current().answer;
  if (!wasOpened && !(await mutate('evidence', { caseId: current().id, clueId: id }))) return;
  showEvidence(current().clues.find(c => c.id === id), !wasOpened);
}
async function submit(words) {
  if (busy) return;
  const caseId = current().id;
  if (!request || request.caseId !== caseId || !sameWords(request.words, words)) request = { caseId, words: words === null ? null : { ...words }, requestId: crypto.randomUUID() };
  if (await mutate('answer', request)) { request = null; selected = {}; scrollTop(); }
}
function bind() {
  document.querySelector('#book-help').onclick = () => document.querySelector('#help-modal').showModal();
  document.querySelectorAll('[data-close-help]').forEach(b => b.onclick = () => document.querySelector('#help-modal').close());
  document.querySelector('#book-map').onclick = () => { if (page === 'collection') goCurrent(); else { page = 'collection'; newRecord = null; error = ''; render(); scrollTop(); } };
  document.querySelectorAll('[data-case]').forEach(b => b.onclick = () => { index = +b.dataset.case; page = phase(current()); selected = {}; activeSlot = 'who'; showScene = false; newRecord = null; render(); scrollTop(); });
  document.querySelectorAll('[data-clue]').forEach(b => b.onclick = () => openClue(b.dataset.clue));
  document.querySelectorAll('[data-record]').forEach(b => b.onclick = () => goRecord(b.dataset.record));
  document.querySelectorAll('[data-map-record]').forEach(b => {
    b.onclick = () => goRecord(b.dataset.mapRecord);
    b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRecord(b.dataset.mapRecord); } };
  });
  document.querySelector('#show-choices')?.addEventListener('click', async () => { showScene = false; if (current().optionsOpened) { render(); scrollTop(); } else if (await mutate('options', { caseId: current().id })) scrollTop(); });
  document.querySelector('#review-situation')?.addEventListener('click', () => { showScene = true; render(); scrollTop(); });
  document.querySelectorAll('[data-slot]').forEach(button => button.onclick = () => { activeSlot = button.dataset.slot; render(); document.querySelector('.word-bank')?.scrollIntoView({ block: 'nearest' }); });
  document.querySelectorAll('[data-word]').forEach(button => button.onclick = () => {
    selected[button.dataset.forSlot] = button.dataset.word;
    const next = current().report.slots.find(slot => !selected[slot.id]);
    if (next) activeSlot = next.id;
    render();
    document.querySelector(next ? '.word-bank' : '#submit-case')?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    document.querySelector(next ? '.word-option' : '#submit-case')?.focus({ preventScroll: true });
  });
  document.querySelector('#submit-case')?.addEventListener('click', () => submit(selected));
  document.querySelector('#skip-case')?.addEventListener('click', () => submit(null));
  document.querySelector('#reveal-region')?.addEventListener('click', async () => {
    if (current().recorded) { page = 'location'; render(); scrollTop(); }
    else { newRecord = current().id; if (await mutate('record', { caseId: current().id })) scrollTop(); }
  });
  document.querySelector('#next-case')?.addEventListener('click', () => {
    if (index === state.cases.length - 1 && state.completed) { page = 'summary'; render(); scrollTop(); }
    else { index++; page = phase(current()); selected = {}; activeSlot = 'who'; showScene = false; newRecord = null; render(); scrollTop(); }
  });
  document.querySelector('#reread-story')?.addEventListener('click', () => { page = 'answer'; render(); scrollTop(); });
  document.querySelector('#resume-case')?.addEventListener('click', goCurrent);
  document.querySelector('#summary-map')?.addEventListener('click', () => { page = 'collection'; render(); scrollTop(); });
  document.querySelector('.aerial-details')?.addEventListener('toggle', event => {
    const image = event.currentTarget.querySelector('img');
    if (event.currentTarget.open && !image.getAttribute('src')) {
      image.onerror = () => { image.hidden = true; document.querySelector('.photo-failure').hidden = false; };
      image.src = image.dataset.photoSrc;
    }
  });
}
async function prepareShare() {
  const preview = document.querySelector('#book-share-preview'), status = document.querySelector('#share-status');
  try {
    shareBlob ||= await shareImage(state);
    if (!preview.isConnected) return;
    const url = URL.createObjectURL(shareBlob); preview.src = url; preview.hidden = false;
    preview.onload = () => URL.revokeObjectURL(url);
    document.querySelector('#share-casebook').disabled = false; document.querySelector('#save-casebook').disabled = false;
    status.textContent = '正解を伏せた投稿用画像です。';
    document.querySelector('#save-casebook').onclick = () => { downloadResult(shareBlob); status.textContent = '保存した画像をSNSに添付できます。'; };
    document.querySelector('#share-casebook').onclick = async () => {
      const file = new File([shareBlob], 'ibun-demo.png', { type: 'image/png' });
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: '異聞調査録', text: shareText(state, shareUrl()), files: [file] });
        else { downloadResult(shareBlob); status.textContent = '画像を保存しました。「投稿文をコピー」と一緒に使えます。'; }
      } catch (e) { status.textContent = e.name === 'AbortError' ? '共有をキャンセルしました。' : '共有できませんでした。「画像を保存」も使えます。'; }
    };
  } catch { if (status.isConnected) status.textContent = '画像を準備できませんでした。投稿文のコピーで共有できます。'; }
  document.querySelector('#copy-casebook')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareText(state, shareUrl())); status.textContent = '投稿文をコピーしました。'; }
    catch {
      const text = document.createElement('textarea'); text.value = shareText(state, shareUrl()); text.setAttribute('aria-label', '共有する投稿文');
      document.querySelector('.book-share').append(text); text.focus(); text.select(); status.textContent = '投稿文を選択しました。長押ししてコピーできます。';
    }
  });
}
app.innerHTML = '<div class="book-loading" role="status"><span class="brand-seal">異</span><p>調査録を開いています…</p></div>';
try { state = await api(); goCurrent(); }
catch { app.innerHTML = '<div class="book-loading"><h1>調査録を開けませんでした。</h1><p>通信を確認して、もう一度お試しください。</p><button class="book-primary" id="retry-book">もう一度開く</button></div>'; document.querySelector('#retry-book').onclick = () => location.reload(); }
