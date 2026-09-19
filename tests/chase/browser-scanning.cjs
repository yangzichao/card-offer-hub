const { verifyWorkspaceReload } = require('../helpers/browser-workspace.cjs');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { listing, offer, endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');

const script = readFileSync(resolve(__dirname, '../../dist/chase-offer-lite.user.js'), 'utf8');
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
    const installFixture = failStorage => {
        window.fixtureBodyMissingAtInitialization = document.body === null;
        window.fixtureDOMContentLoaded = false;
        document.addEventListener('DOMContentLoaded', () => { window.fixtureDOMContentLoaded = true; }, { once: true });
        window.fixtureStorage = JSON.parse(sessionStorage.getItem('__fixtureUserscriptStorage') || '{}');
        window.unsafeWindow = window;
        window.GM_getValue = (key, fallback) => window.fixtureStorage[key] ?? fallback;
        window.GM_setValue = (key, value) => {
            if (failStorage) throw new Error('Synthetic storage failure');
            window.fixtureStorage[key] = value;
        };
    };
    // One init script guarantees GM setup precedes the userscript at document-start.
    await page.addInitScript({ content: `(${installFixture.toString()})(${JSON.stringify(mode === 'storage')});\n${script}` });
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) {
            await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><title>Synthetic Chase fixture</title></head><body style="background:#eef2f6;font-family:system-ui"><h1>Chase Offers · synthetic test page</h1></body></html>' });
            return;
        }
        if (!request.url().startsWith(endpoint)) {
            errors.push('Unexpected network destination');
            await route.abort();
            return;
        }
        const headers = await request.allHeaders();
        const accountIdentifier = JSON.parse(headers['path-params']).primaryDigitalAccountIdentifierList[0];
        const native = new URL(request.url()).searchParams.get('native-fixture') === 'true';
        requests.push({ accountIdentifier, native, method: request.method(), time: await page.evaluate(() => Date.now()) });
        if (!native && mode === '429') {
            await route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
            return;
        }
        const payload = listing(accountIdentifier, [offer('a'), offer('b', 'SERVED'), offer('already', 'ACTIVATED'), offer('a')]);
        if (!native && mode === 'partial') payload.customerOffers[0].partial = true;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('https://secure.chase.com/web/auth/dashboard');
    assert.equal(await page.evaluate(() => window.fixtureBodyMissingAtInitialization), true, 'userscript initializes before a body exists');
    assert.equal(await page.evaluate(() => window.fixtureDOMContentLoaded), true, 'DOMContentLoaded has fired');
    assert.equal(await page.getByRole('button', { name: 'Detect cards', exact: true }).isVisible(), true, 'DOMContentLoaded mounts the panel');
    const status = () => page.getByRole('status').innerText();
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 160; turn++) {
            if (pattern.test(await status())) return;
            await page.clock.runFor(1000);
        }
        throw new Error(`Did not reach ${pattern}: ${await status()}`);
    }
    async function captureNativeRequest(transport = 'fetch') {
        const payload = await page.evaluate(async ({ url, headers, transport }) => {
            if (transport === 'fetch') return (await fetch(url, { headers })).json();
            return new Promise((resolve, reject) => {
                const request = new XMLHttpRequest();
                request.open('GET', url);
                for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
                request.onload = () => resolve(JSON.parse(request.responseText));
                request.onerror = reject;
                request.send();
            });
        }, { url: `${endpoint}?native-fixture=true`, headers: sessionHeaders(), transport });
        assert.equal(payload.customerOffers[0].offers.length, 4, 'observer preserves the page response');
        // Response.clone parsing can finish after the page has consumed its copy.
        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        await advanceUntil(mode === 'storage' ? /Cannot save/ : /Detected 2/);
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
    }
    return { context, page, requests, errors, status, advanceUntil, captureNativeRequest };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        await successful.page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0, 'installation never starts a request');
        await successful.captureNativeRequest();
        assert.equal(successful.requests.length, 1, 'detect cards only reads the native response');
        await successful.page.getByRole('checkbox', { name: 'Select Synthetic Card A · 0000', exact: true }).check();
        await successful.page.getByRole('checkbox', { name: 'Select Synthetic Card B · 0000', exact: true }).check();
        await successful.page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await successful.page.getByRole('searchbox', { name: 'Search saved offers' }).fill('does-not-match');
        await successful.advanceUntil(/Scan complete: 6 offers/);
        const scans = successful.requests.filter(request => !request.native);
        assert.deepEqual(scans.map(request => request.accountIdentifier), ['101', '202']);
        assert.ok(scans.every(request => request.method === 'GET'));
        assert.ok(scans[1].time - scans[0].time >= 500);
        assert.equal(await successful.page.getByRole('button', { name: 'Add all offers' }).isEnabled(), false);
        await successful.page.getByRole('searchbox', { name: 'Search saved offers' }).fill('');
        assert.equal(await successful.page.locator('.offer').count(), 6);
        await successful.page.screenshot({ path: resolve(outputDirectory, 'chase-scan-complete.png') });
        await verifyWorkspaceReload({ page: successful.page, script, id: 'chase-offer-lite', bank: 'Chase', requests: successful.requests, activationName: 'Add all offers', documentStart: true });
        await successful.page.getByRole('button', { name: 'Minimize Chase panel' }).click();
        assert.equal(await successful.page.getByRole('button', { name: 'Detect cards' }).isVisible(), false);
        await successful.page.getByRole('button', { name: 'Expand Chase panel' }).click();
        assert.deepEqual(successful.errors, []);
        await successful.context.close();

        for (const mode of ['429', 'partial', 'storage']) {
            const failed = await fixture(browser, mode);
            await failed.captureNativeRequest('xhr');
            if (mode === 'storage') {
                assert.match(await failed.page.getByRole('alert').innerText(), /Cannot save/);
                assert.equal(await failed.page.getByRole('button', { name: 'Scan offers' }).isEnabled(), false);
                await failed.page.clock.runFor(60000);
                assert.equal(failed.requests.filter(request => !request.native).length, 0);
                await failed.context.close();
                continue;
            }
            await failed.page.getByRole('checkbox', { name: 'Select Synthetic Card A · 0000', exact: true }).check();
            await failed.page.getByRole('button', { name: 'Scan offers', exact: true }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : mode === 'partial' ? /partial|incomplete/ : /Cannot save/);
            assert.equal(failed.requests.filter(request => !request.native).length, mode === 'storage' ? 0 : 1);
            if (mode === 'storage') assert.match(await failed.page.getByRole('alert').innerText(), /Cannot save/);
            await failed.page.clock.runFor(60000);
            if (mode === '429') {
                await failed.page.getByRole('button', { name: 'Scan offers' }).click();
                await failed.advanceUntil(/Rate limited/);
            }
            assert.equal(failed.requests.filter(request => !request.native).length, mode === 'storage' ? 0 : 1, 'failures never retry');
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }
        console.log('Chase browser regression passed: passive fetch/XHR observation, manual selection, read-only scans, pacing, 429, partial responses, visible storage errors, search, panel controls.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
