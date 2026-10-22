const copy = {
  ja: { report: 'この場所に、こんな物語。', image: '現地周辺の航空写真', imageNote: '地上から撮影した写真ではありません。撮影日は地点ごとに未確認です。', photoFailed: '写真を読み込めませんでした。下の物語はそのまま読めます。', trivia: 'もう一つ、知っておきたい話', sources: 'この話の出典', sourceRead: '本文参照済み', sourcePending: '本文の最終照合待ち', draft: '体験版の原稿です。伝承と史実を区別して紹介しています。座標・翻訳を含む最終確認は継続中です。', official: '公式の案内を開く', map: 'この場所を地図で見る' },
  en: { report: 'A place with a story.', image: 'Aerial photograph of the area', imageNote: 'This is not a ground-level photograph. The capture date has not been checked for each location.', photoFailed: 'The photo could not load. You can still read the story below.', trivia: 'One more thing to discover', sources: 'Sources for this story', sourceRead: 'Source text consulted', sourcePending: 'Source text awaiting final review', draft: 'Preview draft. Folklore is distinguished from historical fact. Final coordinate and translation review is ongoing.', official: 'Open the official information', map: 'See this place on the map' }
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Answer-only reading experience. No collapsed body or map-tile export. */
export function storyReport(q, locale, roundId) {
  const text = copy[locale], report = q.report[locale], title = q.title[locale];
  return `<article class="story-report" id="story-report" aria-labelledby="result-heading"><header class="report-header"><span class="report-kicker">${text.report}</span><p class="report-region">${esc(q.region[locale])}</p><h2 id="result-heading">${esc(title)}</h2><h3>${esc(report.headline)}</h3></header><figure class="report-figure"><img id="report-photo" src="${q.reportImage.url}?round=${roundId}" alt="${esc(title)} — ${text.image}" width="1000" height="625" decoding="async"><div class="report-photo-failed" hidden>${text.photoFailed}</div><figcaption><span class="image-type">${text.image}</span><a href="${esc(q.reportImage.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(q.reportImage.credit)}</a></figcaption></figure><div class="report-prose"><p class="report-lead">${esc(report.lead)}</p>${report.sections.map((section, index) => `<section class="report-section"><span class="section-number">0${index + 1}</span><div><h4>${esc(section.title)}</h4><p>${esc(section.body)}</p></div></section>`).join('')}<aside class="report-trivia"><span>${text.trivia}</span><h4>${esc(report.trivia.title)}</h4><p>${esc(report.trivia.body)}</p></aside><div class="report-actions"><button id="focus-answer"><i class="dot mint"></i>${text.map} ↗</button>${q.sources[0] ? `<a href="${esc(q.sources[0].url)}" target="_blank" rel="noopener noreferrer">${text.official} ↗</a>` : ''}</div><section class="report-sources"><h4>${text.sources}</h4><ul>${q.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a><span>${s.access === 'read' ? text.sourceRead : text.sourcePending}</span></li>`).join('')}</ul><p>${text.draft}</p><p>${text.imageNote}</p></section></div></article>`;
}

export function bindReportPhoto() {
  const image = document.querySelector('#report-photo');
  if (!image) return;
  const showError = () => { image.hidden = true; document.querySelector('.report-photo-failed').hidden = false; };
  image.addEventListener('error', showError);
  if (image.complete && image.naturalWidth === 0) showError();
}
