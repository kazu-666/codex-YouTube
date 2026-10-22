const copy = {
  ja: {
    title: '土着信仰調査室', ready: '投稿用の画像です。正解の場所は載せていません。',
    loading: '結果画像を作成中…', share: '画像つきで共有', download: '画像を保存', copied: '投稿文をコピーしました。',
    selected: '投稿文を選択しました。長押ししてコピーできます。', failed: '共有できませんでした。「画像を保存」から投稿できます。',
    imageFailed: '画像を作成できませんでした。投稿文をコピーして共有できます。', saved: '画像を保存しました。SNSで画像を添付して投稿できます。',
    noHints: '追加ヒントなし', hints: count => `追加ヒント ${count}/5問`, challenge: 'あなたは何点とれる？', unit: '点'
  },
  en: {
    title: 'Fieldnotes Atlas', ready: 'Your share image. Answer locations are kept hidden.',
    loading: 'Creating your result image…', share: 'Share with image', download: 'Save image', copied: 'Post text copied.',
    selected: 'Post text selected. Press and hold to copy.', failed: 'Sharing failed. Save the image to attach it to your post.',
    imageFailed: 'Could not create the image. You can still copy the post text.', saved: 'Image saved. Attach it to your social post.',
    noHints: 'No extra hints', hints: count => `Extra hints: ${count}/5 places`, challenge: 'Can you beat my score?', unit: ' points'
  }
};

const hintCount = state => state.questions.filter(q => q.answer.usedHint).length;
const tier = q => {
  const ratio = q.answer.points / q.maxPoints;
  return ratio >= .9 ? ['🟩', '#a1cab7'] : ratio >= .5 ? ['🟨', '#d7b47c'] : ratio > 0 ? ['🟧', '#c68a64'] : ['⬛', '#60716e'];
};

export function buildShareText(state, locale, url) {
  const words = copy[locale];
  const hints = hintCount(state);
  return `${words.title} | ${state.day}\n${state.total.toLocaleString()} / ${state.maxTotal.toLocaleString()}${words.unit}\n${state.questions.map(q => tier(q)[0]).join('')}\n${hints ? words.hints(hints) : words.noHints}\n${words.challenge}\n${url}`;
}

/** Draw our own score artwork; never export map tiles or answer locations. */
export async function createResultImage(state, locale, url) {
  const words = copy[locale];
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const text = (value, x, y, size, color = '#e8e9df', weight = 400, align = 'left') => {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
  };
  const background = ctx.createLinearGradient(0, 0, 1200, 1200);
  background.addColorStop(0, '#152b31'); background.addColorStop(1, '#080f16');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 1200);
  ctx.strokeStyle = '#a1cab733'; ctx.lineWidth = 1; ctx.strokeRect(40, 40, 1120, 1120);

  // An original wire globe, independent of external imagery and its availability.
  ctx.save(); ctx.beginPath(); ctx.arc(1020, 350, 270, 0, Math.PI * 2); ctx.clip();
  const glow = ctx.createRadialGradient(940, 270, 20, 1020, 350, 270);
  glow.addColorStop(0, '#315c5c'); glow.addColorStop(1, '#102329');
  ctx.fillStyle = glow; ctx.fillRect(750, 80, 540, 540);
  ctx.strokeStyle = '#91baaa44'; ctx.lineWidth = 2;
  for (const width of [65, 165, 270]) {
    ctx.beginPath(); ctx.ellipse(1020, 350, width, 270, -.3, 0, Math.PI * 2); ctx.stroke();
  }
  for (const offset of [-170, -85, 0, 85, 170]) {
    ctx.beginPath(); ctx.ellipse(1020, 350 + offset, Math.sqrt(270 ** 2 - offset ** 2), 45, -.1, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  text('FIELDNOTES ATLAS', 88, 108, 25, '#d7b47c', 600);
  text(state.day, 1112, 108, 26, '#a6bcb2', 400, 'right');
  text(locale === 'ja' ? '土着信仰調査室' : 'DAILY WORLD EXPLORATION', 88, 168, 34);
  text('DAILY SCORE', 88, 282, 24, '#a1cab7', 600);
  text(state.total.toLocaleString(), 76, 491, 202, '#e5c18b', 600);
  text(`/ ${state.maxTotal.toLocaleString()}`, 88, 554, 44, '#a6bcb2');
  text('05 PLACES · ONE WORLD', 88, 663, 25, '#a1cab7', 500);
  state.questions.forEach((q, index) => {
    const x = 88 + index * 210;
    const color = tier(q)[1];
    ctx.fillStyle = '#12272c'; ctx.fillRect(x, 706, 184, 218);
    ctx.strokeStyle = '#91baaa44'; ctx.strokeRect(x, 706, 184, 218);
    text(`0${index + 1}`, x + 20, 750, 25, '#a6bcb2');
    text(String(q.answer.points), x + 20, 816, 52, color, 600);
    text(`/ ${q.maxPoints}`, x + 20, 857, 25, '#a6bcb2');
    ctx.fillStyle = '#2b4142'; ctx.fillRect(x + 20, 888, 144, 5);
    ctx.fillStyle = color; ctx.fillRect(x + 20, 888, 144 * q.answer.points / q.maxPoints, 5);
    if (q.answer.usedHint) text('HINT', x + 164, 750, 17, '#d7b47c', 500, 'right');
  });
  const hints = hintCount(state);
  text(hints ? words.hints(hints) : words.noHints, 88, 979, 27, '#a6bcb2');
  text(words.challenge, 88, 1070, 39, '#e5c18b', 500);
  text(new URL(url).host, 88, 1122, 23, '#a6bcb2');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed')), 'image/png'));
}

export function mountResultShare({ state, locale, url }) {
  const words = copy[locale];
  const shareButton = document.querySelector('#share-result');
  const saveButton = document.querySelector('#save-result');
  const status = document.querySelector('#share-status');
  const preview = document.querySelector('#share-preview');
  const post = document.querySelector('#share-text');
  post.value = buildShareText(state, locale, url);
  status.textContent = words.loading;
  let disposed = false;
  let imageUrl;
  let file;
  function save() {
    const link = document.createElement('a');
    link.href = imageUrl; link.download = file.name;
    document.body.append(link); link.click(); link.remove();
    status.textContent = words.saved;
  }
  shareButton.onclick = async () => {
    if (!file) return;
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) { save(); return; }
    shareButton.disabled = true;
    try {
      // The file is prepared before the click so native sharing retains user activation.
      await navigator.share({ title: words.title, text: post.value, files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = words.failed;
    } finally { shareButton.disabled = false; }
  };
  saveButton.onclick = save;
  document.querySelector('#copy-result').onclick = async () => {
    try { await navigator.clipboard.writeText(post.value); status.textContent = words.copied; }
    catch {
      post.closest('details').open = true; post.focus(); post.select(); post.setSelectionRange(0, post.value.length);
      status.textContent = words.selected;
    }
  };
  createResultImage(state, locale, url).then(blob => {
    if (disposed) return;
    file = new File([blob], `fieldnotes-${state.day}.png`, { type: 'image/png' });
    imageUrl = URL.createObjectURL(blob);
    preview.src = imageUrl; preview.hidden = false;
    shareButton.textContent = navigator.share && navigator.canShare?.({ files: [file] }) ? words.share : words.download;
    shareButton.disabled = false; saveButton.disabled = false;
    status.textContent = words.ready;
  }).catch(() => { if (!disposed) status.textContent = words.imageFailed; });
  return () => { disposed = true; if (imageUrl) URL.revokeObjectURL(imageUrl); };
}
