const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { crossBankStorage } = require('./fixtures/cross-bank-offers.cjs');
const source = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
const screenshotDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(screenshotDirectory, { recursive: true });

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
        page.setDefaultTimeout(5000);
        const requests = [], errors = [], seeds = Object.fromEntries(crossBankStorage());
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install();
        await page.route('**/*', async route => {
            if (!route.request().isNavigationRequest()) { requests.push(route.request().url()); return route.abort(); }
            await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="background:#e8ede8;font:16px system-ui;padding:40px"><h1>Bank website</h1><p>Synthetic offers · browser regression</p></body></html>' });
        });
        await page.addInitScript({ content: `window.unsafeWindow = window;
            window.syntheticStorage = JSON.parse(sessionStorage.getItem('search-fixture') || ${JSON.stringify(JSON.stringify(seeds))});
            window.GM_getValue = (key, fallback) => structuredClone(window.syntheticStorage[key] ?? fallback);
            window.GM_setValue = (key, value) => {
                if (window.failSearchSave && key === 'hub:search-preferences') throw new Error('Synthetic storage failure');
                window.syntheticStorage[key] = structuredClone(value);
                sessionStorage.setItem('search-fixture', JSON.stringify(window.syntheticStorage));
            };
            ${source}` });
        await page.goto('https://online.citi.com/US/nga/products-offers/merchantoffers');
        const open = () => page.getByRole('button', { name: 'Search all banks', exact: true }).click();
        await open();
        const dialog = page.getByRole('dialog');
        const query = page.getByRole('searchbox', { name: 'Search offers across all banks', exact: true });
        assert.equal(await page.locator('.hub-result').count(), 7);
        assert.equal(await query.evaluate(element => element === element.getRootNode().activeElement), true);
        assert.match(await dialog.innerText(), /Gold · 1001/);
        assert.match(await dialog.innerText(), /Custom Cash · 2002/);
        assert.match(await dialog.innerText(), /Needs review/);
        assert.match(await dialog.innerText(), /Scanned/);
        await page.screenshot({ path: resolve(screenshotDirectory, 'cross-bank-search-desktop.png') });
        await query.fill('everyday');
        assert.equal(await page.locator('.hub-result').count(), 3);
        await page.getByRole('combobox', { name: 'Filter by offer status', exact: true }).selectOption('added');
        assert.equal(await page.locator('.hub-result').count(), 1);
        assert.match(await page.locator('.hub-result').innerText(), /Wells Fargo/);
        const link = page.getByRole('link', { name: 'Open Wells Fargo offers in a new tab' });
        assert.equal(await link.getAttribute('href'), 'https://web.secure.wellsfargo.com/auth/deals-portal');
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
        await page.getByRole('combobox', { name: 'Filter by bank', exact: true }).selectOption('citi-offer-lite');
        assert.match(await page.locator('.hub-empty').innerText(), /No matching offers/);
        await page.reload();
        await open();
        assert.equal(await query.inputValue(), 'everyday');
        assert.equal(await page.getByRole('combobox', { name: 'Filter by bank', exact: true }).inputValue(), 'citi-offer-lite');
        await page.getByRole('button', { name: 'Clear cross-bank filters', exact: true }).click();
        await query.fill('cafe dining');
        assert.equal(await page.locator('.hub-result').count(), 1);
        assert.match(await page.locator('.hub-result').innerText(), /Needs review/);
        await page.keyboard.press('Escape');
        assert.equal(await dialog.count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Search all banks', exact: true }).evaluate(element => element === element.getRootNode().activeElement), true);

        await open();
        await page.getByRole('button', { name: 'Clear cross-bank filters', exact: true }).click();
        // A concurrent bank update becomes searchable by re-reading GM storage.
        await page.evaluate(() => {
            const key = 'issuer:usbank-offer-lite:usbank-offer-lite:workspace';
            const saved = GM_getValue(key);
            saved.offers[0].merchant = '<img src=x onerror=alert(1)>';
            GM_setValue(key, saved);
        });
        await page.getByRole('button', { name: 'Reload saved results', exact: true }).click();
        await query.fill('<img');
        assert.equal(await page.locator('.hub-result').count(), 1);
        assert.equal(await dialog.locator('img').count(), 0, 'saved strings are text, never markup');
        await page.evaluate(() => { window.failSearchSave = true; });
        await query.fill('new preference');
        assert.match(await page.locator('#hub-preferences-error').innerText(), /could not be saved/);
        await page.evaluate(() => { window.failSearchSave = false; GM_setValue('hub:search-preferences', { schemaVersion: 99, keep: 'untouched' }); });
        await page.getByRole('button', { name: 'Close cross-bank search', exact: true }).click();
        await open();
        await query.fill('market');
        assert.equal(await page.evaluate(() => GM_getValue('hub:search-preferences').keep), 'untouched');
        assert.match(await page.locator('#hub-preferences-error').innerText(), /preserved/);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: resolve(screenshotDirectory, 'cross-bank-search-mobile.png') });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
        assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'no horizontal overflow');
        // Corruption is visible and isolated; other banks remain searchable.
        await page.evaluate(() => GM_setValue('issuer:citi-offer-lite:citi-offer-lite:workspace', { schemaVersion: 99 }));
        await page.getByRole('button', { name: 'Reload saved results', exact: true }).click();
        assert.match(await page.locator('#hub-data-warning').innerText(), /excluded/);
        assert.equal(await page.locator('.hub-result').count(), 2);
        await page.evaluate(() => {
            const key = 'issuer:usbank-offer-lite:usbank-offer-lite:workspace';
            const saved = GM_getValue(key);
            saved.offers = Array.from({ length: 75 }, (_, index) => ({ ...saved.offers[0], offerId: `many-${index}`, merchant: 'Many results' }));
            GM_setValue(key, saved);
        });
        await page.getByRole('button', { name: 'Reload saved results', exact: true }).click();
        await query.fill('many');
        assert.equal(await page.locator('.hub-result').count(), 60);
        await page.getByRole('button', { name: 'Show more cross-bank results', exact: true }).click();
        assert.equal(await page.locator('.hub-result').count(), 75);
        await page.evaluate(() => {
            for (const key of Object.keys(window.syntheticStorage)) if (key.startsWith('issuer:')) delete window.syntheticStorage[key];
        });
        await page.getByRole('button', { name: 'Reload saved results', exact: true }).click();
        assert.match(await page.locator('.hub-empty').innerText(), /No saved offers yet/);
        await page.clock.runFor(60000);
        assert.deepEqual(requests, [], 'search, filters, refresh and idle time must not call any network');
        assert.deepEqual(errors, []);
        console.log('PASS: cross-bank search, card labels, status and bank filters, saved preferences, reload, focus/Escape, local refresh, corruption, XSS text handling, no requests and mobile layout.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
