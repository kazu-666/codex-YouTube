import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// This suite tests real browser gestures, not the external provider's map data.
// Keep network-dependent checks separate from this deterministic fixture.
const style = {
  version: 8,
  sources: { land: { type: 'geojson', data: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[75,8],[85,22],[120,22],[145,50],[80,60],[75,8]]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[130,32],[134,33],[142,41],[140,42],[130,32]]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[132.30,34.25],[132.35,34.25],[132.35,34.31],[132.30,34.31],[132.30,34.25]]] } }
  ] } } },
  layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': '#295163' } }, { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#a9b8a1' } }, { id: 'shore', type: 'line', source: 'land', paint: { 'line-color': '#d0dcc1', 'line-width': 1 } }]
};
const transparentTile = fs.readFileSync(new URL('./fixtures/transparent-tile.png', import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldnotes-browser-'));
const port = 3107;
const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), FIELDNOTES_DATA_DIR: dataDir }, stdio: 'pipe' });
let browser;
try {
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('Game running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
  });
  await ready;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'], env: { ...process.env, XDG_CONFIG_HOME: '/tmp/fieldnotes-pw-config', XDG_CACHE_HOME: '/tmp/fieldnotes-pw-cache' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.sharedResults = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: async data => {
      window.sharedResults.push({ text: data.text, files: data.files.map(file => ({ name: file.name, size: file.size, type: file.type })) });
    } });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) console.log('Browser:', msg.text().slice(0,250)); });
  let imageryRequests = 0;
  await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(style) }));
  await page.route('https://server.arcgisonline.com/**', route => { imageryRequests++; return route.fulfill({ status: 200, contentType: 'image/png', body: transparentTile }); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('#atlas[data-ready="true"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/fieldnotes-globe-initial.png' });
  assert.ok(imageryRequests > 0, 'satellite imagery tiles should be requested');
  assert.equal(await page.locator('#imagery-warning').isHidden(), true, 'working satellite tiles should not show a warning');
  assert.equal(await page.locator('#tap-callout').count(), 1, 'answer locks on a map tap');
  const rect = await page.locator('#atlas').boundingBox();
  assert.ok(rect.width <= 390, 'map should fit mobile width');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  const cdp = await context.newCDPSession(page);
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const initialZoom = Number(await page.locator('#atlas').getAttribute('data-zoom') || .55);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 35, y: cy, id: 0 }, { x: cx + 35, y: cy, id: 1 }] });
  for (let n = 1; n <= 10; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 35 - n * 7, y: cy, id: 0 }, { x: cx + 35 + n * 7, y: cy, id: 1 }] });
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const pinchZoom = Number(await page.locator('#atlas').getAttribute('data-zoom'));
  assert.ok(pinchZoom > initialZoom + .7, `pinch should zoom: ${initialZoom} -> ${pinchZoom}`);
  assert.equal(await page.locator('#tap-callout').count(), 1, 'pinch must not answer');
  const lng = Number(await page.locator('#atlas').getAttribute('data-longitude'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 55, y: cy, id: 0 }] });
  for (let n = 1; n <= 8; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 55 + n * 12, y: cy, id: 0 }] });
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  assert.ok(Math.abs(Number(await page.locator('#atlas').getAttribute('data-longitude')) - lng) > 5, 'drag should turn the globe');
  assert.equal(await page.locator('#tap-callout').count(), 1, 'drag must not answer');
  await page.touchscreen.tap(cx, cy);
  await page.locator('#next').waitFor();
  assert.equal(await page.locator('.result-stats').count(), 1, 'one tap should record the answer and reveal the score');
  await page.screenshot({ path: '/tmp/fieldnotes-globe-mobile.png', fullPage: true });
  let checkedDetail = false;
  for (let i = 0; i < 5; i++) {
    if (i === 1) {
      await page.locator('.settings > summary').click();
      await page.locator('#plan').selectOption('premium');
      await page.locator('#extra-hint').click();
      await page.locator('.extra-clue').waitFor();
      await page.locator('#atlas[data-ready="true"]').waitFor();
    }
    if (i > 0) await page.locator('#center-pin').click();
    await page.locator('#next').waitFor();
    await page.locator('#focus-answer').waitFor();
    await page.locator('#atlas[data-ready="true"]').waitFor();
    if ((await page.locator('h1').textContent()) === '厳島神社') {
      await page.locator('#focus-answer').click();
      await page.waitForTimeout(1500);
      const zoom = Number(await page.locator('#atlas').getAttribute('data-zoom'));
      assert.ok(zoom >= 15.9, `detail zoom should reach street scale: ${zoom}`);
      assert.ok(Math.abs(Number(await page.locator('#atlas').getAttribute('data-latitude')) - 34.2958) < .001, 'detail view must center on Itsukushima latitude');
      assert.ok(Math.abs(Number(await page.locator('#atlas').getAttribute('data-longitude')) - 132.3197) < .001, 'detail view must center on Itsukushima longitude');
      await page.waitForTimeout(1800);
      const pin = await page.locator('.correct .pin-dot').boundingBox();
      assert.ok(pin.width < 32 && pin.height < 32, 'pin stays small at high zoom');
      const mapRect = await page.locator('#atlas').boundingBox();
      assert.ok(Math.abs(pin.x + pin.width / 2 - (mapRect.x + mapRect.width / 2)) < 40, 'correct pin must be near the center after focus');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await page.screenshot({ path: '/tmp/fieldnotes-globe-detail-viewport.png' });
      checkedDetail = true;
    }
    await page.locator('#next').click();
    if (i < 4) await page.locator('#atlas[data-ready="true"]').waitFor();
  }
  assert.equal(checkedDetail, true, 'Itsukushima detail scenario must execute');
  await page.locator('#share-result:enabled').waitFor();
  assert.equal(await page.locator('#share-preview').evaluate(img => img.naturalWidth), 1200);
  assert.equal(await page.locator('#share-preview').evaluate(img => img.naturalHeight), 1200);
  const resultState = await page.evaluate(async () => (await fetch('/api/state')).json());
  const post = await page.locator('#share-text').inputValue();
  assert.ok(post.includes(`${resultState.total.toLocaleString()} / 1,000点`), 'post must contain the actual total');
  assert.ok(post.includes('追加ヒント 1/5問'), 'post must disclose extra hint use');
  for (const q of resultState.questions) assert.ok(!post.includes(q.title.ja), 'post must not spoil answer names');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedPost = text; } } }); });
  await page.locator('#copy-result').click();
  assert.equal(await page.evaluate(() => window.copiedPost), post, 'copy button must copy the complete post');
  await page.locator('#share-result').click();
  const shared = await page.evaluate(() => window.sharedResults[0]);
  assert.equal(shared.text, post);
  assert.equal(shared.files[0].type, 'image/png');
  assert.ok(shared.files[0].size > 10000, 'native share must receive an actual image file');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#save-result').click();
  const download = await downloadEvent;
  await download.saveAs('/tmp/fieldnotes-result-card.png');
  const png = fs.readFileSync('/tmp/fieldnotes-result-card.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 1200);
  let unexpectedDownloads = 0;
  page.on('download', () => unexpectedDownloads++);
  await page.evaluate(() => { navigator.share = async () => { throw new DOMException('Cancelled', 'AbortError'); }; });
  await page.locator('#share-result').click();
  await page.waitForTimeout(100);
  assert.equal(unexpectedDownloads, 0, 'cancelling native sharing must not download a file');
  await page.locator('#locale').click();
  await page.locator('#share-result:enabled').waitFor();
  assert.ok((await page.locator('#share-text').inputValue()).includes('Extra hints: 1/5 places'));
  const downloadPage = await context.newPage();
  await downloadPage.addInitScript(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
  await downloadPage.goto(`http://127.0.0.1:${port}/`);
  await downloadPage.locator('#share-result:enabled').waitFor();
  assert.equal(await downloadPage.locator('#share-result').textContent(), 'Save image', 'unsupported native sharing must offer image saving');
  const fallbackDownload = downloadPage.waitForEvent('download');
  await downloadPage.locator('#share-result').click();
  assert.match((await fallbackDownload).suggestedFilename(), /^fieldnotes-\d{4}-\d{2}-\d{2}\.png$/);
  await downloadPage.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); });
  await downloadPage.locator('#copy-result').click();
  assert.equal(await downloadPage.locator('.share-post').getAttribute('open'), '', 'unavailable clipboard must reveal selectable post text');
  assert.equal(await downloadPage.locator('#share-text').evaluate(el => el.selectionEnd - el.selectionStart), (await downloadPage.locator('#share-text').inputValue()).length);
  await downloadPage.close();
  assert.deepEqual(errors, [], 'no browser JavaScript exceptions');
  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.route('https://tiles.openfreemap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(style) }));
  await fallbackPage.route('https://server.arcgisonline.com/**', route => route.abort('failed'));
  await fallbackPage.goto(`http://127.0.0.1:${port}/`);
  await fallbackPage.locator('#atlas[data-ready="true"]').waitFor({ timeout: 30000 });
  await fallbackPage.locator('#imagery-warning:visible').waitFor({ timeout: 30000 });
  await fallbackPage.locator('#center-pin').click();
  await fallbackPage.locator('.result-stats').waitFor();
  await fallbackContext.close();
  console.log('PASS: mobile globe gestures, detailed pins, five answers, native image sharing, PNG download, hint disclosure, no-spoiler post, English, completed-round reload and map fallback. Map data and native sharing are mocked.');
} finally {
  await browser?.close();
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
