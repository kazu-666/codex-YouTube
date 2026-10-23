const date = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function shareText(state, url) {
  return `異聞調査録｜考察デモ\n${state.total} / ${state.maxTotal} 点\n${state.cases.map(c => c.answer.correct ? '🟩' : c.answer.points ? '🟨' : '⬜').join('')}\n${state.collection.length}件の土地を記録しました。\n手がかりから、物語の背景を考える３話。\n${url}`;
}
export async function shareImage(state) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101b21'; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#c8a86b'; ctx.lineWidth = 2; ctx.strokeRect(35, 35, 1130, 560);
  ctx.fillStyle = '#cdb784'; ctx.font = '24px sans-serif'; ctx.fillText('異聞調査録  /  考察デモ', 75, 100);
  ctx.fillStyle = '#a7b7ad'; ctx.font = '22px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(date(), 1120, 100); ctx.textAlign = 'left';
  ctx.fillStyle = '#f3ebd7'; ctx.font = 'bold 124px sans-serif'; ctx.fillText(String(state.total), 73, 280);
  ctx.font = '32px sans-serif'; ctx.fillStyle = '#afbbaf'; ctx.fillText(`/ ${state.maxTotal} 点`, 350, 274);
  state.cases.forEach((c, i) => {
    const x = 78 + i * 165; ctx.fillStyle = c.answer.correct ? '#b9cdb7' : c.answer.points ? '#cfb57d' : '#384b4d'; ctx.fillRect(x, 340, 135, 68);
    ctx.fillStyle = c.answer.points ? '#172824' : '#d1d4bf'; ctx.font = '25px sans-serif'; ctx.fillText(`0${i + 1}`, x + 16, 383);
  });
  ctx.fillStyle = '#d7d9c3'; ctx.font = '30px sans-serif'; ctx.fillText(`${state.collection.length}件の土地を、調査録に。`, 78, 482);
  ctx.fillStyle = '#93a69e'; ctx.font = '23px sans-serif'; ctx.fillText('手がかりをつなぎ、物語の背景を考える。', 78, 543);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('画像を作成できませんでした。')), 'image/png'));
}
export function downloadResult(blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `ibun-demo-${date()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
