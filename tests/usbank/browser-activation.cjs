const { verifyWorkspaceReload } = require('../helpers/browser-workspace.cjs');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { sessionFixture, offer, listing, acknowledgement } = require('./helpers/userscript-harness.cjs');

const script = readFileSync(resolve(__dirname, '../../dist/usbank-offer-lite.user.js'), 'utf8');
const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });

async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const activated = new Set();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-09-19T12:00:00Z') });
    await page.addInitScript(session => {
        sessionStorage.setItem('offerhubobject', JSON.stringify(session));
        sessionStorage.setItem('userId', 'synthetic-user');
        window.fixtureStorage = {};
        window.GM_getValue = (key, fallback) => window.fixtureStorage[key] ?? fallback;
        window.GM_setValue = (key, value) => { window.fixtureStorage[key] = value; };
    }, sessionFixture);
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) {
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><title>Synthetic US Bank fixture</title></head><body style="background:#eef2f6;font-family:system-ui"><h1>Cash Back Deals · synthetic test page</h1></body></html>' });
        }
        if (request.url() !== 'https://onlinebanking.usbank.com/digital/api/customer-management/graphql/v2') {
            errors.push('Unexpected network destination');
            return route.abort();
        }
        const body = request.postDataJSON();
        const activation = body.query.includes('getActivateOffer');
        requests.push({ body, activation, time: await page.evaluate(() => Date.now()) });
        if (activation && mode === '429') {
            return route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
        }
        if (activation && mode === 'success') activated.add(body.variables.request.clientEvents[0].clientOfferId);
        const payload = activation ? acknowledgement() : listing([
            offer('a', activated.has('a') ? 'ACTIVATED' : 'NEW'),
            offer('b', activated.has('b') ? 'ACTIVATED' : 'SERVED'),
            offer('already', 'ACTIVATED'), offer('unknown', null),
            offer('expired', 'NEW', { endDate: '2020-01-01T00:00:00Z' })
        ]);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('https://onlinebanking.usbank.com/digital/servicing/dominjection/cashback-deals');
    await page.addScriptTag({ content: script });
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 200; turn++) {
            if (pattern.test(await page.getByRole('status').innerText())) return;
            await page.clock.runFor(500);
        }
        throw new Error(`Did not reach ${pattern}: ${await page.getByRole('status').innerText()}`);
    }
    async function scanAndSelect() {
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await advanceUntil(/Scan complete/);
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
        await page.getByRole('button', { name: 'Select all available offers' }).click();
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 2);
    }
    return { context, page, requests, errors, advanceUntil, scanAndSelect };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        const { page } = successful;
        await page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0, 'installation does not send requests');
        assert.equal(await page.getByRole('button', { name: 'Add selected offers' }).isEnabled(), false);
        await successful.scanAndSelect();
        await verifyWorkspaceReload({ page, script, id: 'usbank-offer-lite', bank: 'US Bank', requests: successful.requests, activationName: 'Add selected offers' });
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await successful.advanceUntil(/Scan complete/);
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 2, 'a fresh scan preserves saved selections');
        await page.getByRole('button', { name: 'Clear offer selection' }).click();
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
        await page.getByRole('searchbox', { name: 'Search saved offers' }).fill('Example a');
        await page.getByRole('button', { name: 'Select all available offers' }).click();
        await page.getByRole('button', { name: 'Add selected offers' }).click();
        await successful.advanceUntil(/Finished: 2\/2/);
        assert.equal(successful.requests.length, 7);
        assert.deepEqual(successful.requests.map(request => request.activation), [false, false, false, true, false, true, false]);
        assert.deepEqual(successful.requests.filter(request => request.activation).map(request => request.body.variables.request.clientEvents[0].clientOfferId), ['a', 'b']);
        await page.getByRole('searchbox', { name: 'Search saved offers' }).fill('');
        await page.screenshot({ path: resolve(outputDirectory, 'usbank-activation-complete.png') });
        await page.getByRole('button', { name: 'Minimize US Bank panel' }).click();
        assert.equal(await page.getByRole('button', { name: 'Scan offers', exact: true }).isVisible(), false);
        await page.getByRole('button', { name: 'Expand US Bank panel' }).click();
        await page.setViewportSize({ width: 390, height: 844 });
        const bounds = await page.locator('.panel').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
        await page.screenshot({ path: resolve(outputDirectory, 'usbank-mobile.png') });
        assert.deepEqual(successful.errors, []);
        await successful.context.close();

        for (const mode of ['unconfirmed', '429']) {
            const failed = await fixture(browser, mode);
            await failed.scanAndSelect();
            await failed.page.getByRole('button', { name: 'Add selected offers' }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : /not explicitly confirmed/);
            const requestCount = failed.requests.length;
            assert.equal(failed.requests.filter(request => request.activation).length, 1);
            assert.equal(await failed.page.getByRole('button', { name: 'Add selected offers' }).isEnabled(), false);
            await failed.page.clock.runFor(60000);
            assert.equal(failed.requests.length, requestCount);
            if (mode === '429') {
                await failed.page.getByRole('button', { name: 'Scan offers', exact: true }).click();
                await failed.advanceUntil(/Rate limited/);
                assert.equal(failed.requests.length, requestCount);
            }
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }

        const stopped = await fixture(browser);
        await stopped.scanAndSelect();
        await stopped.page.getByRole('button', { name: 'Add selected offers' }).click();
        await stopped.page.getByRole('button', { name: 'Stop' }).click();
        await stopped.advanceUntil(/Stopped/);
        assert.equal(stopped.requests.filter(request => request.activation).length, 0);
        assert.deepEqual(stopped.errors, []);
        await stopped.context.close();
        console.log('US Bank browser regression passed: manual start, selection/search, write/read-back, unknown confirmation, 429, stop, panel controls, mobile layout.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
