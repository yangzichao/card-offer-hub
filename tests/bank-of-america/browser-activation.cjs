const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { source, token, offer, responder } = require('./helpers/userscript-harness.cjs');

async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const respond = responder([offer(), offer('102', { activation_type: 'LINK' })], mode);
    await page.clock.install({ time: new Date('2026-09-19T12:00:00Z') });
    await page.addInitScript(sessionToken => {
        localStorage.setItem('LS_TOKEN', sessionToken);
        const storage = {};
        window.GM_getValue = (key, fallback) => storage[key] ?? fallback;
        window.GM_setValue = (key, value) => { storage[key] = value; };
    }, token());
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) {
            await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Deals</title><h1>Deals test fixture</h1>' });
            return;
        }
        const url = new URL(request.url());
        if (url.origin !== 'https://deals.merchant-rewards.com' || !['/geo', '/api/offers-search', '/api/offers-details', '/api/activate-offer/101'].includes(url.pathname)) {
            errors.push('Unexpected network request');
            await route.abort();
            return;
        }
        const record = { path: url.pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : undefined, time: await page.evaluate(() => Date.now()) };
        requests.push(record);
        const response = respond(record);
        await route.fulfill({ status: response.status, contentType: 'application/json', headers: response.status === 429 ? { 'Retry-After': '600' } : {}, body: await response.text() });
    });
    await page.goto('https://deals.merchant-rewards.com/');
    await page.addScriptTag({ content: source() });
    async function until(pattern) {
        for (let turn = 0; turn < 160; turn++) {
            if (pattern.test(await page.getByRole('status').innerText())) return;
            await page.clock.runFor(1000);
        }
        throw new Error(`Expected ${pattern}: ${await page.getByRole('status').innerText()}`);
    }
    return { context, page, requests, errors, until };
}
async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const mode of ['success', 'unknown', '429', 'readback', 'stop']) {
            const item = await fixture(browser, mode);
            const { page } = item;
            await page.clock.runFor(60000);
            assert.equal(item.requests.length, 0);
            assert.equal(await page.getByRole('button', { name: 'Activate eligible Deals offers' }).isEnabled(), false);
            await page.getByRole('button', { name: 'Scan Deals offers', exact: true }).click();
            await item.until(/Scan complete: 1 eligible, 1 skipped/);
            await page.getByRole('checkbox').check();
            await page.getByRole('button', { name: 'Activate eligible Deals offers' }).click();
            if (mode === 'stop') await page.getByRole('button', { name: 'Stop Deals activation' }).click();
            await item.until(mode === 'success' ? /Finished: 1\/1/ : mode === '429' ? /HTTP 429/ : mode === 'stop' ? /Stopped/ : /unconfirmed|not explicitly confirmed/);
            assert.equal(item.requests.filter(request => request.method === 'PUT').length, mode === 'stop' ? 0 : 1);
            assert.equal(await page.getByRole('button', { name: 'Activate eligible Deals offers' }).isEnabled(), false);
            for (let index = 1; index < item.requests.length; index++) assert.ok(item.requests[index].time - item.requests[index - 1].time >= 500);
            const count = item.requests.length;
            await page.clock.runFor(60000);
            assert.equal(item.requests.length, count);
            if (mode === '429') {
                await page.getByRole('button', { name: 'Scan Deals offers', exact: true }).click();
                await item.until(/Rate limited/);
                assert.equal(item.requests.length, count);
            }
            if (mode === 'success') {
                mkdirSync(resolve(__dirname, '../../work/browser'), { recursive: true });
                await page.screenshot({ path: resolve(__dirname, '../../work/browser/bofa-activation.png') });
                await page.getByRole('button', { name: 'Minimize Deals panel' }).click();
                assert.equal(await page.getByRole('status').isVisible(), false);
                await page.getByRole('button', { name: 'Expand Deals panel' }).click();
                assert.equal(await page.getByRole('status').isVisible(), true);
            }
            assert.deepEqual(item.errors, []);
            await item.context.close();
        }
        console.log('BankAmeriDeals browser regression passed: manual consent, eligibility, pacing, readback, stop, 429, ambiguity and panel controls.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
