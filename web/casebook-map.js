import japan from './japan-land.json';

const point = ([lng, lat]) => [(lng - 122) * 23, (46 - lat) * 23 + 20];
const rings = japan.geometry.coordinates.flatMap(polygon => polygon);
const coast = rings.map(ring => ring.map((coord, i) => `${i ? 'L' : 'M'}${point(coord).map(n => n.toFixed(1)).join(',')}`).join('') + 'Z').join('');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// A local, non-interactive basemap: no WebGL, remote tiles, or unrevealed sites.
export function recordMap(records, { activeId = null, newId = null } = {}) {
  return `<div class="record-map"><svg viewBox="0 0 700 560" role="group" aria-label="調査した土地の地図、${records.length}件の記録"><path class="map-guide" d="M50 170Q350 90 670 170M50 350Q350 270 670 350M210 40Q170 280 210 510M450 40Q410 280 450 510"/><path class="japan-coast" d="${coast}"/>${records.map(record => {
    const [x, y] = point([record.position[1], record.position[0]]);
    const labelX = record.position[0] < 33.5 ? -146 : 20, labelY = record.position[0] < 33.5 ? 18 : -24;
    return `<g class="record-pin ${record.id === activeId ? 'active' : ''} ${record.id === newId ? 'new-pin' : ''}" transform="translate(${x},${y})" tabindex="0" role="button" data-map-record="${record.id}" aria-label="${esc(record.prefecture)}・${esc(record.place)}の記録を開く"><circle class="pin-halo" r="25"/><circle class="pin-ring" r="14"/><circle class="pin-core" r="5"/><rect class="pin-label-bg" x="${labelX}" y="${labelY}" width="144" height="44" rx="5"/><text class="pin-label" x="${labelX + 12}" y="${labelY + 30}">${esc(record.prefecture)}</text></g>`;
  }).join('')}</svg><div class="map-caption"><span>調査した土地 ${records.length}件</span><span>ピンは地域の目安</span></div><a class="map-credit" href="/licenses/world-atlas-LICENSE.txt" target="_blank" rel="noopener">地図：Natural Earth / world-atlas</a></div>`;
}
