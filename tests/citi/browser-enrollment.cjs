const { verifyWorkspaceReload } = require('../helpers/browser-workspace.cjs');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { cookieFixture, listing, offer, confirmation } = require('./helpers/userscript-harness.cjs');

const script = readFileSync(resolve(__dirname, '../../dist/citi-offer-lite.user.js'), 'utf8');
const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });

async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    await context.addCookies(cookieFixture.split('; ').map(pair => {
        const [name, value] = pair.split('=');
        return { name, value, domain: 'online.citi.com', path: '/', secure: true };
    }));
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    let active = 0;
    let maximumActive = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-09-19T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-19T12:00:01Z'));
    await page.addInitScript(() => {
        window.fixtureStorage = {};
        window.GM_getValue = (key, fallback) => window.fixtureStorage[key] ?? fallback;
        window.GM_setValue = (key, value) => { window.fixtureStorage[key] = value; };
    });
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) {
            await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><title>Synthetic Citi fixture</title></head><body style="background:#eef2f6;font-family:system-ui"><h1>Merchant Offers · synthetic test page</h1></body></html>' });
            return;
        }
        if (!request.url().startsWith('https://online.citi.com/gcgapi/prod/public/v1/')) {
            await route.abort();
            errors.push('Unexpected network destination');
            return;
        }
        const record = { body: request.postDataJSON(), time: await page.evaluate(() => Date.now()), url: request.url() };
        requests.push(record);
        active++;
        maximumActive = Math.max(maximumActive, active);
        try {
            let payload;
            const enrollment = request.url().endsWith('/enrollMerchantOffer');
            if (enrollment && mode === '429') {
                await route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
                return;
            }
            if (enrollment) payload = mode === 'unconfirmed' ? {} : confirmation(record);
            else payload = listing([offer('a'), offer('b'), offer('already', 'ENROLLED'), offer('a')], record.body.accountId ? [] : [
                { accountId: 'card-a', displayProductName: 'Synthetic Card A' },
                { accountId: 'card-b', displayProductName: 'Synthetic Card B' }
            ]);
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
        } finally { active--; }
    });
    await page.goto('https://online.citi.com/US/nga/products-offers/merchantoffers');
    await page.addScriptTag({ content: script });
    const status = () => page.getByRole('status').innerText();
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 150; turn++) {
            if (pattern.test(await status())) return;
            await page.clock.runFor(1000);
        }
        throw new Error(`Did not reach ${pattern}: ${await status()}`);
    }
    async function selectCard() {
        await page.getByRole('button', { name: 'Detect Citi cards', exact: true }).click();
        await page.getByRole('status').filter({ hasText: /Detected 2/ }).waitFor();
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
        await page.getByRole('checkbox', { name: 'Select Synthetic Card A', exact: true }).check();
    }
    return { context, page, requests, errors, status, advanceUntil, selectCard, maximumActive: () => maximumActive };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        const { page } = successful;
        await page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0, 'installation must not initiate requests');
        await successful.selectCard();
        await page.getByRole('button', { name: 'Scan and add all Citi offers', exact: true }).click();
        assert.equal(await page.getByRole('checkbox').first().isEnabled(), false);
        await page.getByRole('searchbox', { name: 'Search Citi offers' }).fill('does-not-match');
        await successful.advanceUntil(/Finished: 2\/2/);
        assert.equal(successful.requests.length, 4, 'detect, scan selected card, two unique available offers');
        assert.equal(successful.maximumActive(), 1);
        assert.ok(successful.requests.slice(1).every(request => request.body.accountId === 'card-a'));
        assert.ok(successful.requests.slice(1).every((request, index) => request.time - successful.requests[index].time >= 500));
        await page.getByRole('searchbox', { name: 'Search Citi offers' }).fill('');
        assert.equal(await page.locator('.offer').count(), 3);
        assert.deepEqual(successful.errors, []);
        await page.screenshot({ path: resolve(outputDirectory, 'citi-enrollment-complete.png') });
        await verifyWorkspaceReload({ page: page, script, id: 'citi-offer-lite', bank: 'Citi', requests: successful.requests, activationName: 'Scan and add all Citi offers' });
        await page.getByRole('button', { name: 'Minimize Citi panel' }).click();
        assert.equal(await page.getByRole('button', { name: 'Detect Citi cards' }).isVisible(), false);
        await page.getByRole('button', { name: 'Expand Citi panel' }).click();
        await successful.context.close();

        for (const mode of ['unconfirmed', '429']) {
            const failed = await fixture(browser, mode);
            await failed.selectCard();
            await failed.page.getByRole('button', { name: 'Scan and add all Citi offers', exact: true }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : /not explicitly confirmed/);
            assert.equal(failed.requests.length, 3);
            assert.equal(await failed.page.getByRole('button', { name: 'Scan and add all Citi offers' }).isEnabled(), false);
            await failed.page.clock.runFor(60000);
            assert.equal(failed.requests.length, 3, 'errors never trigger an automatic retry');
            if (mode === '429') {
                await failed.page.getByRole('button', { name: 'Scan selected Citi cards' }).click();
                await failed.advanceUntil(/Rate limited/);
                assert.equal(failed.requests.length, 3, 'cooldown blocks manual scans too');
            }
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }

        const cancelled = await fixture(browser);
        await cancelled.selectCard();
        await cancelled.page.getByRole('button', { name: 'Scan and add all Citi offers' }).click();
        await cancelled.page.getByRole('button', { name: 'Stop Citi enrollment' }).click();
        await cancelled.advanceUntil(/Stopped/);
        assert.equal(cancelled.requests.length, 1, 'stop during initial pacing must prevent the scan');
        assert.deepEqual(cancelled.errors, []);
        await cancelled.context.close();
        console.log('Citi browser regression passed: manual start, selected cards, serial pacing, success, unknown response, 429, cancellation, search, panel controls.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
