// Editorial build step only. OSM-derived shapes, without names or geographic metadata.
// curl retains the managed environment's proxy and CA trust.
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import questions from '../content/questions.json' with { type: 'json' };

const exec = promisify(execFile);
async function download(url) {
  const { stdout } = await exec('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '30', url], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
const source = JSON.parse(await download('https://tiles.openfreemap.org/planet'));
const z = 14, tileSize = 512, width = 640, height = 400;
const palette = { landcover: '#c4d0b0', landuse: '#d5d3b7', park: '#bdcfa6', water: '#94bdc8', waterway: '#94bdc8', building: '#bcb4a1', transportation: '#fff9e8' };
const manifest = { generatedAt: new Date().toISOString(), source: 'https://tiles.openfreemap.org/planet', tileTemplate: source.tiles[0], zoom: z, license: 'OSM database: ODbL; rendered maps: attribution required', maps: [] };
await fs.mkdir(new URL('../content/evidence/', import.meta.url), { recursive: true });
for (const q of questions) {
  const [lat, lng] = q.coordinate, n = 2 ** z;
  const cx = (lng + 180) / 360 * n * tileSize;
  const cy = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n * tileSize;
  const x0 = cx - width / 2, y0 = cy - height / 2;
  const paths = Object.fromEntries(Object.keys(palette).map(name => [name, []]));
  let featureCount = 0;
  const jobs = [];
  for (let x = Math.floor(x0 / tileSize); x <= Math.floor((x0 + width) / tileSize); x++) {
    for (let y = Math.floor(y0 / tileSize); y <= Math.floor((y0 + height) / tileSize); y++) {
      jobs.push({ x, y, url: source.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y) });
    }
  }
  const tiles = await Promise.all(jobs.map(async job => ({ ...job, tile: new VectorTile(new PbfReader(await download(job.url))) })));
  for (const { x, y, tile } of tiles) {
    for (const [name, elements] of Object.entries(paths)) {
      const layer = tile.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type === 1) continue;
        const scale = tileSize / layer.extent;
        const d = f.loadGeometry().map(ring => ring.map((p, j) => `${j ? 'L' : 'M'}${(x * tileSize + p.x * scale - x0).toFixed(1)},${(y * tileSize + p.y * scale - y0).toFixed(1)}`).join('') + (f.type === 3 ? 'Z' : '')).join('');
        if (!d) continue;
        const linear = f.type === 2;
        const strokeWidth = name === 'waterway' ? 2 : ['motorway', 'trunk', 'primary'].includes(f.properties.class) ? 5 : f.properties.class === 'path' ? 1 : 2.5;
        elements.push(`<path d="${d}" fill="${linear ? 'none' : palette[name]}"${linear ? ` stroke="${palette[name]}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` : ' fill-rule="evenodd"'}/>`);
        featureCount++;
      }
    }
  }
  const metresPerPixel = 40075016.686 * Math.cos(lat * Math.PI / 180) / (n * tileSize);
  const scaleLength = Math.round(500 / metresPerPixel);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><title>現場周辺の地図 / Site map</title><defs><clipPath id="frame"><rect width="640" height="400"/></clipPath></defs><g clip-path="url(#frame)"><rect width="640" height="400" fill="#ede8d6"/>${Object.values(paths).map(p => p.join('')).join('')}</g><g fill="none" stroke="#253e37"><circle cx="320" cy="200" r="15" stroke-width="2"/><path d="M320 176v12m0 24v12m-24-24h12m24 0h12" stroke-width="2"/></g><circle cx="320" cy="200" r="3" fill="#253e37"/><g fill="#203c36" font-family="sans-serif" font-size="14"><rect x="584" y="10" width="42" height="53" rx="4" fill="#fff9e8" fill-opacity=".9"/><text x="599" y="29">N</text><path d="M605 34l-6 17h12Z"/><rect x="12" y="349" width="${scaleLength + 20}" height="35" rx="3" fill="#fff9e8" fill-opacity=".9"/><path d="M22 369v7h${scaleLength}v-7" fill="none" stroke="#203c36" stroke-width="2"/><text x="22" y="366" font-size="12">500 m</text></g><text x="632" y="392" text-anchor="end" font-size="10" font-family="sans-serif" fill="#203c36" stroke="#ede8d6" stroke-width="3" paint-order="stroke">© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap</text></svg>`;
  await fs.writeFile(new URL(`../content/evidence/${q.id}.svg`, import.meta.url), svg);
  manifest.maps.push({ id: q.id, features: featureCount, bytes: Buffer.byteLength(svg), tiles: jobs.length });
  console.log(`${q.id}: ${featureCount} features, ${Math.round(Buffer.byteLength(svg) / 1024)} KiB`);
}
await fs.writeFile(new URL('../research/evidence-map-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
