const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { offer, endpoint, sessionHeaders, dashboardEndpoint, dashboardHeaders } = require('../fixtures/offers-response.cjs');
const { activationListing, clickEndpoint } = require('../fixtures/activation-response.cjs');
const script = readPublishedIssuerSource('chase-offer-lite');
async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const activated = new Set();
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
        if (request.url().startsWith(clickEndpoint)) {
            const parameters = new URL(request.url()).searchParams;
            assert.equal(request.method(), 'GET');
            assert.equal(parameters.get('recommendation-event-type-code'), 'CLICK');
            const accountIdentifier = parameters.get('digital-account-identifier');
            const offerId = parameters.get('offer-identifier');
            requests.push({ accountIdentifier, offerId, click: true, method: request.method(), time: await page.evaluate(() => Date.now()) });
            if (mode !== 'unconfirmed' || offerId !== 'a') activated.add(`${accountIdentifier}:${offerId}`);
            await route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': 'https://secure.chase.com' }, body: '' });
            return;
        }
        if (!request.url().startsWith(endpoint)) {
            errors.push('Unexpected network destination');
            await route.abort();
            return;
        }
        const headers = await request.allHeaders();
        const accountIdentifier = JSON.parse(headers['path-params']).primaryDigitalAccountIdentifierList[0] || '101';
        const native = new URL(request.url()).searchParams.get('native-fixture') === 'true';
        requests.push({ accountIdentifier, native, method: request.method(), time: await page.evaluate(() => Date.now()) });
        if (!native && mode === '429') {
            await route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
            return;
        }
        const payload = activationListing(accountIdentifier,
            [offer('a'), offer('b', 'SERVED'), offer('already', 'ACTIVATED'), offer('a')].map(row =>
                activated.has(`${accountIdentifier}:${row.offerIdentifier}`) ? { ...row, offerStatusName: 'ACTIVATED' } : row));
        // Both cards appear in native Offers despite absent/false shopping flags.
        payload.digitalProfileAccounts[0].shoppingEligibilityIndicator = false;
        delete payload.digitalProfileAccounts[1].shoppingEligibilityIndicator;
        if (new URL(request.url()).searchParams.get('source-request-component-name') === 'OVERVIEW_DASHBOARD') {
            payload.customerOffers[0].totalAvailableOfferCount = 37;
        }
        if (!native && mode === 'partial') payload.customerOffers[0].partial = true;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('https://secure.chase.com/web/auth/dashboard');
    assert.equal(await page.evaluate(() => window.fixtureBodyMissingAtInitialization), true, 'userscript initializes before a body exists');
    assert.equal(await page.evaluate(() => window.fixtureDOMContentLoaded), true, 'DOMContentLoaded has fired');
    assert.equal(await page.getByRole('button', { name: 'Load cards & offers', exact: true }).isVisible(), true, 'DOMContentLoaded mounts the panel');
    const status = () => page.getByRole('status').innerText();
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 160; turn++) {
            if (pattern.test(await status())) return;
            await page.clock.runFor(1000);
        }
        throw new Error(`Did not reach ${pattern}: ${await status()}`);
    }
    async function captureNativeRequest(transport = 'fetch', dashboard = true) {
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
        }, { url: dashboard ? `${dashboardEndpoint}&native-fixture=true` : `${endpoint}?native-fixture=true`,
            headers: dashboard ? dashboardHeaders() : sessionHeaders(), transport });
        assert.equal(payload.customerOffers[0].offers.length, 4, 'observer preserves the page response');
        assert.equal(await page.locator('.offer').count(), 0, 'native previews never become scan results');
    }
    return { context, page, requests, errors, status, advanceUntil, captureNativeRequest };
}

module.exports = { fixture, script };
