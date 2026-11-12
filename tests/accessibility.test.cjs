const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.join(__dirname, '..');
test('both editor documents expose labeled dialogs and load shared accessibility behavior', () => {
  for (const file of ['index.html', 'script_editor/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /id="lib-modal" role="dialog" aria-modal="true" aria-label="Snippet library"/);
    assert.match(html, /role="alertdialog" aria-modal="true" aria-labelledby="custom-confirm-title" aria-describedby="custom-confirm-message"/);
    assert.match(html, /src="(?:\.\.\/)?js\/accessibility.js"/);
    assert.match(html, /id="lib-search" aria-label="Search snippets"/);
  }
});
let chromium;
try { ({chromium} = require('playwright')); } catch {}
test('browser: modal keyboard loop, nested Escape, focus restoration, tabs and editor refresh',
  {skip: !chromium && 'Playwright unavailable; markup checks still run'}, async () => {
    const browser = await chromium.launch({headless: true, channel: process.env.A11Y_BROWSER_CHANNEL || 'msedge', args: ['--allow-file-access-from-files']});
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
      await page.waitForFunction(() => typeof showConfirm === 'function');
      await page.locator('#btn-library').focus();
      await page.evaluate(() => document.getElementById('lib-modal-overlay').classList.add('open'));
      await page.waitForFunction(() => document.getElementById('lib-modal').contains(document.activeElement));
      await page.evaluate(() => showConfirm('Test confirmation', 'Confirm test', function () {window.confirmedByTest = true;}));
      await page.waitForFunction(() => document.activeElement.id === 'btn-confirm-cancel');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-confirm-ok');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-confirm-cancel');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('custom-confirm-overlay').classList.contains('hidden'));
      assert.equal(await page.locator('#lib-modal-overlay').evaluate(el => el.classList.contains('open')), true);
      assert.equal(await page.evaluate(() => window.confirmedByTest), undefined);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement.id === 'btn-library');
      assert.equal(await page.locator('#lib-modal-overlay').getAttribute('aria-hidden'), 'true');
      await page.locator('#tab-expressions').focus();
      // A fake CodeMirror instance confirms refresh is triggered upon visibility.
      await page.evaluate(() => {const el=document.createElement('div');el.className='CodeMirror';el.textContent='test';el.CodeMirror={refresh:()=>window.a11yRefresh=(window.a11yRefresh||0)+1};document.getElementById('script-container').appendChild(el);});
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#tab-code').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#tab-expressions').getAttribute('tabindex'), '-1');
      assert.equal(await page.locator('#expr-container').getAttribute('aria-hidden'), 'true');
      assert.ok(await page.evaluate(() => window.a11yRefresh > 0));
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#tab-expressions').getAttribute('aria-selected'), 'true');
      await page.locator('#prop-filter-header').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.getElementById('prop-filter-header').getAttribute('aria-expanded') === 'true');
      // Exercise the same shared behavior in the script editor document.
      await page.goto(pathToFileURL(path.join(root, 'script_editor/index.html')).href);
      await page.waitForFunction(() => typeof showConfirm === 'function');
      await page.locator('#btn-save').focus();
      await page.evaluate(() => showConfirm('Script view', 'Confirm', function () {}));
      await page.waitForFunction(() => document.activeElement.id === 'btn-confirm-cancel');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement.id === 'btn-save');
    } finally { await browser.close(); }
  });
