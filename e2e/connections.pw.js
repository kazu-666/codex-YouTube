import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import content from '../content/photo-connections.json' with { type: 'json' };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'connections-browser-'));
const port = 3121, base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), FIELDNOTES_DATA_DIR: dir }, stdio: 'pipe' });
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Server timeout')), 10000); child.stdout.on('data', d => { if (String(d).includes('Game running')) { clearTimeout(timer); resolve(); } }); child.once('exit', c => reject(new Error(`Server exit ${c}`))); });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], env: { ...process.env, XDG_CONFIG_HOME: '/tmp/connections-browser-config', XDG_CACHE_HOME: '/tmp/connections-browser-cache' } });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => { window.sharedResult = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.sharedResult = text; } } }); });
  const page = await context.newPage(), requests = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  await page.goto(base + '/'); await page.locator('#c-image-status[hidden]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-tile]').count(), 12);
  assert.equal(await page.locator('.c-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 4);
  assert.equal(await page.locator('#c-submit').isDisabled(), true);
  assert.equal(await page.locator('.c-found .c-solved-strip').count(), 0);
  assert.equal(requests.some(u => /legacy-main|casebook-|fieldwork-|maplibre|arcgisonline|openfreemap/.test(u)), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/ibun-connections-mobile.png', fullPage: true });
  const previewId = await page.locator('[data-tile]').first().getAttribute('data-tile');
  await page.locator(`[data-preview="${previewId}"]`).click();
  await page.locator('#c-preview-photo').waitFor();
  assert.equal(await page.locator('.c-preview-caption strong').textContent(), content.tiles.find(t => t.id === previewId).label);
  await page.locator('#c-preview-select').click();
  assert.equal(await page.locator(`[data-tile="${previewId}"]`).getAttribute('aria-pressed'), 'true');
  await page.locator('#c-preview-close').click(); await page.locator('#c-clear').click();
  const firstId = await page.locator('[data-tile]').first().getAttribute('data-tile');
  await page.locator(`[data-tile="${firstId}"]`).click();
  // Simulate the viewport transition of a foldable phone while a tile is selected.
  for (const viewport of [{ width: 720, height: 844 }, { width: 280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.locator(`[data-tile="${firstId}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.locator('#c-clear').click();
  assert.ok(requests.some(u => /kojiki-photos\.webp/.test(u)), 'the actual local generated atlas is loaded');
  assert.equal(await page.locator('.c-word,.c-word-label').count(), 0, 'the board is photographs rather than word buttons');
  const select = async ids => { for (const id of ids) await page.locator(`[data-tile="${id}"]`).click(); };
  const near = [...content.groups[0].tileIds.slice(0, 3), content.groups[1].tileIds[0]];
  await select(near); await page.locator('#c-submit').click(); await page.locator('#c-notice.near').waitFor();
  assert.equal(await page.locator('.c-lives').getAttribute('aria-label'), '残り3回');
  await page.locator('#c-submit').click(); await page.locator('#c-notice.repeated').waitFor();
  assert.equal(await page.locator('.c-lives').getAttribute('aria-label'), '残り3回');
  await page.locator('#c-clear').click();
  await select(content.groups[0].tileIds);
  // Simulate a committed answer whose HTTP response is lost.
  await page.route('**/api/connections/guess', async route => { await route.fetch(); await route.abort('failed'); });
  await page.locator('#c-submit').click(); await page.locator('.c-found .c-solved-strip').waitFor();
  await page.unroute('**/api/connections/guess');
  await page.locator('.c-discovery').waitFor();
  assert.equal(await page.locator('.c-discovery .c-quartet .c-mini').count(), 4);
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.c-converge path')).strokeDashoffset) === 0 && getComputedStyle(document.querySelector('.c-discovery')).opacity === '1');
  await page.screenshot({ path: '/tmp/ibun-photo-teeth-discovery.png' });
  await page.locator('#c-discovery-close').click();
  assert.equal(await page.locator('[data-tile]').count(), 8);
  assert.equal(await page.locator('#c-submit').isDisabled(), true);
  await page.reload(); await page.locator('#c-image-status[hidden]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('.c-found .c-solved-strip').count(), 1);
  assert.equal(await page.locator('.c-lives').getAttribute('aria-label'), '残り3回');
  await page.locator('#c-shuffle').click();
  for (const group of content.groups.slice(1)) {
    await select(group.tileIds); await page.locator('#c-submit').click();
    await page.waitForFunction(count => document.querySelectorAll('.c-found .c-solved-strip').length === count, content.groups.indexOf(group) + 1);
    await page.locator('.c-discovery').waitFor();
    if (group.visual === 'escape') {
      assert.equal(await page.locator('.c-discovery .c-link-row').count(), 3);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.c-discovery')).opacity === '1');
      await page.screenshot({ path: '/tmp/ibun-photo-escape-discovery.png' });
    }
    if (group.visual === 'body') {
      assert.equal(await page.locator('.c-discovery .c-body-item').count(), 4);
      assert.equal(await page.locator('.c-discovery .c-anatomy svg').isVisible(), true);
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.c-body-lines path')).strokeDashoffset) === 0 && getComputedStyle(document.querySelector('.c-discovery')).opacity === '1');
      await page.screenshot({ path: '/tmp/ibun-photo-body-discovery.png' });
      // A photo can be inspected inside the discovery without losing the discovery dialog.
      await page.locator('.c-discovery [data-preview]').first().click();
      await page.locator('#c-preview-close').click();
      assert.equal(await page.locator('.c-discovery').isVisible(), true);
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('c-dialog-open')), true);
    }
    await page.locator('#c-discovery-close').click();
  }
  await page.locator('.c-result').waitFor();
  assert.equal(await page.locator('.c-score strong').textContent(), '300');
  assert.equal(await page.locator('[data-tile]').count(), 0);
  assert.equal(await page.locator('.c-sources').getAttribute('open'), null);
  await page.locator('.c-sources summary').click();
  assert.equal(await page.locator('.c-sources a').count(), 2);
  await page.screenshot({ path: '/tmp/ibun-connections-result.png', fullPage: true });
  await page.locator('#c-copy').click();
  const shared = await page.evaluate(() => window.sharedResult);
  assert.ok(shared.includes('300 / 300')); assert.ok(shared.includes('?mode=connections'));
  for (const group of content.groups) assert.ok(!shared.includes(group.title));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#c-save').click()]);
  await download.saveAs('/tmp/ibun-connections-share.png'); assert.ok(fs.statSync('/tmp/ibun-connections-share.png').size > 7000);
  page.once('dialog', d => d.accept()); await page.locator('#c-reset').click(); await page.locator('[data-tile]').first().waitFor();
  assert.equal(await page.locator('[data-tile]').count(), 12);
  page.once('dialog', d => d.accept()); await page.locator('#c-reveal').click(); await page.locator('.c-result').waitFor();
  assert.equal(await page.locator('.c-score strong').textContent(), '0'); assert.equal(await page.locator('.c-remaining .c-group').count(), 3);
  for (const width of [280, 320, 720, 1280]) {
    const c = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/?mode=connections&round=first'); await p.locator('#c-image-status[hidden]').waitFor({ state: 'attached' });
    assert.equal(await p.locator('[data-tile]').count(), 12);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await p.screenshot({ path: `/tmp/ibun-connections-${width}.png`, fullPage: true });
    // Four distinct misses reveal the remaining groups without requiring a correct answer.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await p.locator('#c-clear').click();
      const ids = [content.groups[0].tileIds[attempt], content.groups[0].tileIds[(attempt + 1) % 4], content.groups[1].tileIds[attempt], content.groups[2].tileIds[attempt]];
      for (const id of ids) await p.locator(`[data-tile="${id}"]`).click();
      await p.locator('#c-submit').click();
      if (attempt < 3) await p.waitForFunction(n => document.querySelector('.c-lives')?.getAttribute('aria-label') === `残り${n}回`, 3 - attempt);
    }
    await p.locator('.c-result').waitFor();
    assert.equal(await p.locator('.c-remaining .c-group').count(), 3);
    if (width === 320) assert.equal(await p.locator('.c-group').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await c.close();
  }
  const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const failedPage = await failedContext.newPage();
  await failedPage.route('**/kojiki-photos.webp', route => route.abort());
  await failedPage.goto(base + '/?mode=connections'); await failedPage.locator('#c-image-retry').waitFor();
  assert.equal(await failedPage.locator('[data-tile]').first().isDisabled(), true);
  await failedPage.unroute('**/kojiki-photos.webp'); await failedPage.locator('#c-image-retry').click();
  await failedPage.locator('#c-image-status[hidden]').waitFor({ state: 'attached' });
  assert.equal(await failedPage.locator('[data-tile]').first().isDisabled(), false);
  assert.deepEqual(errors, []);
  console.log('Photo connections passed: actual generated twelve-photo atlas, photo-only board, preview names, foldable selection, 280/320/390/720/desktop, photo discoveries and body map, nested dialogs, near/repeat feedback, lost response recovery, saved progress, all-correct/all-miss, image retry, sources and spoiler-free text/PNG. Clipboard only is mocked.');
} finally { await browser?.close(); child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
