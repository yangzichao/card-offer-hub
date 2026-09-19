const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { bootstrap, listing, offer } = require('./helpers/userscript-harness.cjs');
const script = readFileSync(resolve(__dirname, '../../dist/wellsfargo-offer-lite.user.js'), 'utf8');
const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });

async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
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
            await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic Wells Fargo Deals</title></head><body style="background:#eef2f6;font-family:system-ui"><h1>My Wells Fargo Deals · synthetic test page</h1><script>${bootstrap()}</script></body></html>` });
            return;
        }
        const url = new URL(request.url());
        if (url.origin !== 'https://web.secure.wellsfargo.com' || !['/deals-portal/as/getDeals', '/deals-portal/as/activateCLDeal'].includes(url.pathname)) {
            errors.push('Unexpected network destination');
            await route.abort();
            return;
        }
        const enrollment = request.method() === 'POST';
        const record = { body: enrollment ? request.postDataJSON() : undefined, method: request.method(), time: await page.evaluate(() => Date.now()), url: request.url() };
        requests.push(record);
        if (enrollment && mode === '429') {
            await route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
            return;
        }
        const payload = enrollment ? (mode === 'unconfirmed' ? {} : { status: 'SUCCESS' })
            : listing([offer('1001'), offer('1002'), offer('1001'), offer('1003', { multiCardFlag: true })], [offer('1004')]);
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('https://web.secure.wellsfargo.com/auth/deals-portal');
    await page.addScriptTag({ content: script });
    const status = () => page.getByRole('status').innerText();
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 150; turn++) {
            if (pattern.test(await status())) return;
            await page.clock.runFor(1000);
        }
        throw new Error(`Did not reach ${pattern}: ${await status()}`);
    }
    async function consentAndScan() {
        await page.getByRole('button', { name: 'Scan Wells Fargo offers', exact: true }).click();
        await page.getByRole('status').filter({ hasText: /Scan complete/ }).waitFor();
        assert.equal(await page.getByRole('checkbox').isChecked(), false);
        assert.equal(await page.getByRole('button', { name: 'Scan and add all Wells Fargo offers' }).isEnabled(), false);
        await page.getByRole('checkbox', { name: 'Allow account-wide Wells Fargo activation' }).check();
    }
    return { context, page, requests, errors, status, advanceUntil, consentAndScan };
}
async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        const { page } = successful;
        await page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0, 'installation must not initiate requests');
        await successful.consentAndScan();
        await page.getByRole('button', { name: 'Scan and add all Wells Fargo offers', exact: true }).click();
        assert.equal(await page.getByRole('checkbox').isEnabled(), false);
        await page.getByRole('searchbox', { name: 'Search Wells Fargo offers' }).fill('does-not-match');
        await successful.advanceUntil(/Finished: 2\/2/);
        assert.deepEqual(successful.requests.map(request => request.method), ['GET', 'GET', 'POST', 'POST']);
        assert.ok(successful.requests.slice(1).every((request, index) => request.time - successful.requests[index].time >= 500));
        for (const request of successful.requests.filter(item => item.method === 'POST')) {
            assert.equal(new URL(request.url).searchParams.get('token'), 'synthetic-token');
            assert.equal(request.body.activityCode, 'ENROLL');
            assert.deepEqual(Object.values(request.body.offerIdCheckSumMap), ['']);
        }
        await page.getByRole('searchbox', { name: 'Search Wells Fargo offers' }).fill('');
        assert.equal(await page.locator('.offer').count(), 4);
        assert.deepEqual(successful.errors, []);
        await page.screenshot({ path: resolve(outputDirectory, 'wellsfargo-enrollment-complete.png') });
        await page.getByRole('button', { name: 'Minimize Wells Fargo panel' }).click();
        assert.equal(await page.getByRole('button', { name: 'Scan Wells Fargo offers', exact: true }).isVisible(), false);
        await page.getByRole('button', { name: 'Expand Wells Fargo panel' }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        const box = await page.locator('.panel').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= 390);
        await successful.context.close();

        for (const mode of ['unconfirmed', '429']) {
            const failed = await fixture(browser, mode);
            await failed.consentAndScan();
            await failed.page.getByRole('button', { name: 'Scan and add all Wells Fargo offers' }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : /not explicitly confirmed/);
            assert.equal(failed.requests.length, 3);
            assert.equal(await failed.page.getByRole('button', { name: 'Scan and add all Wells Fargo offers' }).isEnabled(), false);
            await failed.page.clock.runFor(60000);
            assert.equal(failed.requests.length, 3, 'errors never automatically retry');
            if (mode === '429') {
                await failed.page.getByRole('button', { name: 'Scan Wells Fargo offers', exact: true }).click();
                await failed.advanceUntil(/Rate limited/);
                assert.equal(failed.requests.length, 3);
            }
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }
        const cancelled = await fixture(browser);
        await cancelled.consentAndScan();
        await cancelled.page.getByRole('button', { name: 'Scan and add all Wells Fargo offers' }).click();
        await cancelled.page.getByRole('button', { name: 'Stop Wells Fargo activation' }).click();
        await cancelled.advanceUntil(/Stopped/);
        assert.equal(cancelled.requests.length, 1);
        assert.deepEqual(cancelled.errors, []);
        await cancelled.context.close();
        console.log('Wells Fargo browser regression passed: manual scan/consent, token, serial pacing, success, unsupported offers, unknown response, 429, stop, search, panel, mobile width.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
