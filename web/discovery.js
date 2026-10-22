const copy = {
  ja: {
    newTitle: '新しい手がかりを発見', reviewTitle: '見つかった手がかり', close: '閉じる',
    continue: 'この手がかりで捜索を続ける', closest: '現場まで最接近',
    note: 'この情報を使って、現場資料と地図をもう一度見比べよう。',
    regional: '地域メモ', story: '曰くの断片', stamp: '調査進展',
    threshold: level => `${level === 1 ? '100' : '20'}km以内で判明`,
  },
  en: {
    newTitle: 'New evidence discovered', reviewTitle: 'Your discovered evidence', close: 'Close',
    continue: 'Continue searching with this evidence', closest: 'Closest to the site',
    note: 'Use this evidence to compare the site image with the map again.',
    regional: 'Regional note', story: 'Story fragment', stamp: 'DISCOVERY',
    threshold: level => `Found within ${level === 1 ? '100' : '20'} km`,
  }
};
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A shared, lightweight opening sequence. The server chooses the unlocked text. */
export function showDiscovery({ dialog, question, locale, levels, isNew = false }) {
  const records = question.unlocked.filter(record => !levels || levels.includes(record.level));
  if (!records.length) return;
  const words = copy[locale];
  const returnFocus = document.activeElement;
  const distance = Math.min(...question.attempts.map(attempt => attempt.distanceKm));
  const formatted = new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: distance < 10 ? 1 : 0 }).format(distance);
  dialog.className = 'discovery-dialog';
  dialog.innerHTML = `<div class="dialog-bar discovery-top"><span>FIELD NOTES · ${String(question.number).padStart(2, '0')}</span><button id="close-discovery" aria-label="${words.close}">${words.close} ×</button></div><div class="discovery-heading"><span class="discovery-kicker">${isNew ? words.stamp : 'FIELD RECORDS'}</span><h2 id="discovery-title">${isNew ? words.newTitle : words.reviewTitle}</h2><p id="discovery-description">${words.closest} <strong>${formatted} km</strong></p></div><div class="discovery-art" aria-hidden="true"><div class="discovery-ring"></div><div class="discovery-envelope"><div class="envelope-page"><span>✦</span><i></i><i></i></div><div class="envelope-back"></div><div class="envelope-pocket"></div><div class="envelope-flap"></div><span class="envelope-seal">FIELD NOTES</span></div></div><div class="discovery-cards">${records.map((record, index) => `<article class="discovery-card" data-level="${record.level}" style="--order:${index}"><div><span>0${record.level} / ${record.level === 1 ? words.regional : words.story}</span><small>${words.threshold(record.level)}</small></div><p>${escape(record.text[locale] || record.text.ja)}</p></article>`).join('')}</div><p class="discovery-note">${words.note}</p><button class="primary" id="continue-search">${words.continue} →</button>`;
  dialog.setAttribute('aria-labelledby', 'discovery-title');
  dialog.setAttribute('aria-describedby', 'discovery-description');
  dialog.dataset.animation = isNew ? 'ready' : 'complete';
  dialog.querySelector('#close-discovery').onclick = () => dialog.close();
  dialog.querySelector('#continue-search').onclick = () => dialog.close();
  dialog.onclose = () => {
    delete dialog.dataset.animation;
    const target = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : document.querySelector('#open-evidence');
    target?.focus({ preventScroll: true });
  };
  dialog.showModal();
  if (isNew) requestAnimationFrame(() => { if (dialog.open) dialog.dataset.animation = 'opening'; });
}
