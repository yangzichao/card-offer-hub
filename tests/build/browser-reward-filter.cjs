const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { source, token, offer, responder } = require('../bank-of-america/helpers/userscript-harness.cjs');

// Real Chromium on a synthetic Deals page: every request is intercepted and
// answered with synthetic offers. Storage survives reloads through sessionStorage.
const OFFERS = [
    offer('101', { merchant_name: 'Example Percent', reward_type: 'PERCENTAGE', reward_value: 0, reward_rate: 9 }),
    offer('102', { merchant_name: 'Example Fixed', reward_type: 'FIXED', reward_value: 15, reward_rate: 0, headline: 'Earn $15 cash back when you spend $75 at Example!' }),
    offer('103', { merchant_name: 'Example Small', reward_type: 'PERCENTAGE', reward_value: 0, reward_rate: 2 }),
    offer('104', { merchant_name: 'Example Unknown' })
];

async function openDeals(page, requests, errors) {
    await page.goto('https://deals.merchant-rewards.com/');
    await page.addScriptTag({ content: source() });
    await page.getByRole('group', { name: 'Hide small offers' }).waitFor();
    assert.deepEqual(errors, []);
    return { rate: page.getByRole('spinbutton', { name: 'Hide offers under this percent back' }),
        total: page.getByRole('spinbutton', { name: 'Hide offers under this total cash back in dollars' }) };
}
async function shownMerchants(page) {
    return page.locator('#offers .offer-merchant').allInnerTexts();
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
        const page = await context.newPage();
        const requests = [];
        const errors = [];
        const respond = responder(OFFERS);
        await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
        await page.addInitScript(sessionToken => {
            localStorage.setItem('LS_TOKEN', sessionToken);
            const storage = JSON.parse(sessionStorage.getItem('__fixtureGm') || '{}');
            window.GM_getValue = (key, fallback) => key in storage ? structuredClone(storage[key]) : fallback;
            window.GM_setValue = (key, value) => { storage[key] = structuredClone(value); sessionStorage.setItem('__fixtureGm', JSON.stringify(storage)); };
        }, token());
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Deals</title><h1>Deals test fixture</h1>' });
                return;
            }
            const url = new URL(request.url());
            if (url.origin !== 'https://deals.merchant-rewards.com'
                || !(['/geo', '/api/offers-search', '/api/offers-details'].includes(url.pathname) || url.pathname.startsWith('/api/activate-offer/'))) {
                errors.push(`Unexpected request ${url.pathname}`);
                await route.abort();
                return;
            }
            const record = { path: url.pathname, method: request.method(), body: request.postData() ? request.postDataJSON() : undefined };
            requests.push(record);
            const response = respond(record);
            await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
        });

        let controls = await openDeals(page, requests, errors);
        await page.clock.runFor(60000);
        assert.equal(requests.length, 0, 'the filter sends nothing on its own');
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        for (let turn = 0; turn < 60 && !/Scan complete/.test(await page.getByRole('status').innerText()); turn++) await page.clock.runFor(1000);
        const list = await page.locator('#offers').innerText();
        for (const text of ['9% back · no cap listed', '$15 back on $75 (20%)', '2% back · no cap listed']) assert.ok(list.includes(text), text);
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Fixed', 'Example Small', 'Example Unknown']);

        const scanned = requests.length;
        await page.getByRole('checkbox', { name: 'Confirm activation for current Deals profile' }).check();
        await controls.rate.fill('5');
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Fixed', 'Example Unknown']);
        assert.equal(await page.locator('#hub-reward-note').innerText(), '1 small offer hidden and skipped by Add. Clear the filter to add them.');
        await controls.total.fill('20');
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Unknown'], 'no cap and unknown values stay visible');
        assert.equal(await page.locator('#hub-reward-note').innerText(), '2 small offers hidden and skipped by Add. Clear the filter to add them.');
        assert.match(await page.locator('#add').innerText(), /\(2\)/, 'Add all counts only the offers still shown');
        assert.equal(requests.length, scanned, 'filtering is local');
        await page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        for (let turn = 0; turn < 120 && !/Finished/.test(await page.getByRole('status').innerText()); turn++) await page.clock.runFor(1000);
        assert.match(await page.getByRole('status').innerText(), /Finished: 2 of 2 added\./);
        assert.deepEqual(requests.filter(request => request.method === 'PUT').map(request => request.path),
            ['/api/activate-offer/101', '/api/activate-offer/104'], 'Add all skips the hidden small offers');
        const added = requests.length;
        mkdirSync(resolve(__dirname, '../../work/browser'), { recursive: true });
        await controls.total.fill('');
        await page.screenshot({ path: resolve(__dirname, '../../work/browser/reward-filter.png') });
        await controls.total.fill('20');

        await page.reload();
        controls = await openDeals(page, requests, errors);
        await page.clock.runFor(60000);
        assert.equal(requests.length, added, 'reload restores without requests');
        assert.equal(await controls.rate.inputValue(), '5');
        assert.equal(await controls.total.inputValue(), '20');
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Unknown'], 'saved rewards filter restored offers');
        assert.ok((await page.locator('#offers').innerText()).includes('9% back · no cap listed'));

        await controls.rate.fill('');
        await controls.total.fill('');
        assert.equal(await page.locator('.offer').count(), 4);
        assert.equal(await page.locator('#hub-reward-note').isHidden(), true);
        assert.match(await page.locator('#add').innerText(), /\(2\)/, 'clearing the filter offers the skipped ones next');

        await page.setViewportSize({ width: 320, height: 700 });
        const overflow = await page.evaluate(() => {
            const panel = document.getElementById('bofa-offer-lite').shadowRoot.querySelector('.panel');
            return panel.scrollWidth - panel.clientWidth;
        });
        assert.ok(overflow <= 0, `filter fits a 320px viewport (overflow ${overflow}px)`);
        assert.deepEqual(errors, []);
        await context.close();
        console.log('PASS: reward values on rows, small-offer filter by percent and total, unknown values kept, Add all skips hidden offers, saved filter and rewards after reload, filtering sends no requests, 320px width.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
