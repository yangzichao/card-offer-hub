const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { cookieFixture, listing, offer, confirmation } = require('./userscript-harness.cjs');
const script = readPublishedIssuerSource('citi-offer-lite');

async function fixture(browser, mode = 'success') {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    await context.addCookies(cookieFixture.split('; ').map(pair => {
        const [name, value] = pair.split('=');
        return { name, value, domain: 'online.citi.com', path: '/', secure: true };
    }));
    const page = await context.newPage();
    const requests = [];
    const bankState = { cards: ['card-a', 'card-b'], enrolled: new Set() };
    const errors = [];
    let active = 0;
    let maximumActive = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-09-19T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-19T12:00:01Z'));
    await page.addInitScript(() => {
        window.fixtureStorage = JSON.parse(sessionStorage.getItem('citi-fixture-storage') || '{}');
        window.GM_getValue = (key, fallback) => window.fixtureStorage[key] ?? fallback;
        window.GM_setValue = (key, value) => {
            window.fixtureStorage[key] = structuredClone(value);
            sessionStorage.setItem('citi-fixture-storage', JSON.stringify(window.fixtureStorage));
        };
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
            if (enrollment) {
                payload = mode === 'unconfirmed' ? {} : confirmation(record);
                if (mode !== 'unconfirmed') bankState.enrolled.add(`${record.body.accountId}:${record.body.offerId}`);
            } else {
                const offers = ['a', 'b', 'already', 'a'].map(id => offer(id,
                    id === 'already' || bankState.enrolled.has(`${record.body.accountId}:${id}`) ? 'ENROLLED' : 'AVAILABLE'));
                payload = listing(offers, record.body.accountId ? [] : bankState.cards.map(accountId => ({
                    accountId, displayProductName: `Synthetic Card ${accountId.slice(-1).toUpperCase()}`
                })));
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
        } finally { active--; }
    });
    await page.goto('https://online.citi.com/US/nga/products-offers/merchantoffers');
    await page.addScriptTag({ content: script });
    const status = () => page.getByRole('status').innerText();
    async function advanceUntil(pattern, stepMilliseconds = 1000) {
        for (let turn = 0; turn < 150; turn++) {
            if (pattern.test(await status())) return;
            await page.clock.runFor(stepMilliseconds);
        }
        throw new Error(`Did not reach ${pattern}: ${await status()}`);
    }
    async function selectCard() {
        await page.getByRole('button', { name: 'Refresh all cards & offers', exact: true }).click();
        await advanceUntil(/Refresh complete/, 100);
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
        await page.getByRole('checkbox', { name: 'Select Synthetic Card A', exact: true }).check();
    }
    return { context, page, requests, errors, status, advanceUntil, selectCard, bankState, script, maximumActive: () => maximumActive };
}

module.exports = { fixture };
