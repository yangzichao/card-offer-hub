const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { bankUrlCases } = require('./fixtures/bank-url-cases.cjs');
const userscript = readFileSync(join(projectRoot, 'dist/card-offer-hub-all.user.js'), 'utf8');

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const script of loadScriptRegistry()) {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
            page.setDefaultTimeout(5000);
            const requests = [], errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => {
                if (!route.request().isNavigationRequest()) {
                    requests.push(route.request().url());
                    return route.abort();
                }
                return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>Synthetic bank</main></body></html>' });
            });
            await page.addInitScript({ content: `window.unsafeWindow = window;
                window.storageWrites = [];
                window.GM_getValue = (key, fallback) => fallback;
                window.GM_setValue = (key, value) => window.storageWrites.push(key);
                ${userscript}` });
            for (const url of bankUrlCases.find(bank => bank.id === script.id).urls.entry) {
                await page.goto(url);
                const host = page.locator(`[id="${script.id}-entry"]`);
                await host.waitFor();
                assert.equal(await page.getByRole('link', { name: `Open ${script.bankLabel} offers`, exact: true }).getAttribute('href'), script.offersUrl);
                assert.equal(await page.getByRole('button', { name: 'Scan offers', exact: true }).count(), 0);
                assert.equal(await page.evaluate(() => window.storageWrites.length), 0);
                assert.equal(await page.evaluate(() => Object.keys(window).some(key => key.startsWith('__cardOfferHubAllStarted_'))), false);
                await page.getByRole('button', { name: 'Search all banks', exact: true }).click();
                await page.getByRole('dialog').waitFor();
                await page.getByRole('button', { name: 'Close cross-bank search' }).click();
                await page.getByRole('button', { name: 'Collapse Card Offer Hub' }).click();
                await page.getByRole('button', { name: 'Expand Card Offer Hub' }).click();
                const bounds = await page.locator('.panel').boundingBox();
                assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
                await page.evaluate(() => {
                    history.pushState({}, '', '/login#signed-in');
                    document.body.replaceChildren(document.createElement('main'));
                });
                await host.waitFor();
                await page.addScriptTag({ content: userscript });
                assert.equal(await host.count(), 1);
                // Follow the actual entry into a different origin and confirm
                // that the complete adapter replaces the entry on navigation.
                await page.getByRole('link', { name: `Open ${script.bankLabel} offers`, exact: true }).click();
                const panelId = script.id + (script.issuer === 'amex' ? '-ui' : '');
                await page.locator(`[id="${panelId}"]`).waitFor();
                assert.equal(await host.count(), 0);
            }
            assert.deepEqual(requests, [], 'entry, cached search, navigation and initialization never request bank APIs');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS: all six banks, 18 apex/public/alternate entry URLs, cached search, Offers links, navigation to adapters, narrow viewport, SPA repair and no automatic requests.');
    } finally {
        await browser.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
