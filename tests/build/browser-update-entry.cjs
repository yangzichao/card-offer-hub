const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { bankUrlCases } = require('./fixtures/bank-url-cases.cjs');

const userscript = readFileSync(join(projectRoot, 'dist/card-offer-hub-all.user.js'), 'utf8');
const downloadUrl = userscript.match(/^\/\/ @downloadURL\s+(\S+)/m)[1];
const version = userscript.match(/^\/\/ @version\s+(\S+)/m)[1];

async function verifySurface(browser, script, entry) {
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const requests = [], errors = [];
    try {
        await context.route('**/*', async route => {
            const request = route.request();
            if (request.url() === downloadUrl) {
                requests.push({ url: request.url(), referer: request.headers().referer });
                return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic update installer</h1>' });
            }
            if (request.isNavigationRequest() && request.url() === bankUrl) {
                return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic bank</title><main>Bank page</main>' });
            }
            errors.push(`Unexpected request: ${request.url()}`);
            return route.abort();
        });
        const bankUrl = entry ? bankUrlCases.find(bank => bank.id === script.id).urls.entry[0] : script.offersUrl;
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install();
        await page.addInitScript({ content: `window.unsafeWindow = window;
            window.storageWrites = [];
            window.GM_getValue = (key, fallback) => fallback;
            window.GM_setValue = (key, value) => window.storageWrites.push(key);
            ${userscript}` });
        await page.goto(bankUrl);
        await page.clock.runFor(60000);
        const update = page.getByRole('link', { name: 'Update Card Offer Hub', exact: true });
        assert.equal(await update.count(), 1);
        assert.equal(await update.isVisible(), true);
        assert.equal(await update.getAttribute('href'), downloadUrl, 'the update entry uses the published metadata URL');
        assert.equal(await page.locator('.hub-version').innerText(), `v${version}`);
        assert.deepEqual(requests, [], 'no automatic update check on startup or while idle');
        await page.locator('header button').click();
        assert.equal(await update.isVisible(), true, 'updating remains available in the collapsed panel');
        const beforeUpdate = await page.evaluate(() => window.storageWrites);
        const popupPromise = page.waitForEvent('popup');
        await update.click();
        const popup = await popupPromise;
        await popup.waitForLoadState('domcontentloaded');
        assert.equal(popup.url(), downloadUrl);
        assert.equal(await popup.evaluate(() => window.opener === null), true);
        assert.equal(page.url(), bankUrl, 'updating does not navigate or reload the bank page');
        assert.deepEqual(requests, [{ url: downloadUrl, referer: undefined }]);
        assert.deepEqual(await page.evaluate(() => window.storageWrites), beforeUpdate);
        await popup.close();
        await page.locator('header button').click();
        await page.addScriptTag({ content: userscript });
        assert.equal(await update.count(), 1, 'reinjection does not duplicate the entry');
        const bounds = await update.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
        assert.equal(await page.locator('.panel').evaluate(panel => panel.scrollWidth > panel.clientWidth), false);
        if (script.issuer === 'citi' && !entry) {
            const output = join(projectRoot, 'work/browser');
            mkdirSync(output, { recursive: true });
            await page.screenshot({ path: join(output, 'citi-update-button.png') });
        }
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const script of loadScriptRegistry()) {
            await verifySurface(browser, script, false);
            await verifySurface(browser, script, true);
        }
        console.log('PASS: six bank panels and six entry pages update only on click, open the metadata installer in an isolated tab, preserve the bank page and storage, and fit a 320px viewport.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
