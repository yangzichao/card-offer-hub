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
    offer('104', { merchant_name: 'Example Unknown' }),
    offer('105', { merchant_name: 'Example Added', reward_type: 'PERCENTAGE', reward_value: 0, reward_rate: 10, is_activated: true })
];
const SCREENSHOTS = resolve(__dirname, '../../work/browser');

async function openDeals(page, errors) {
    await page.goto('https://deals.merchant-rewards.com/');
    await page.addScriptTag({ content: source() });
    await page.getByRole('radiogroup', { name: 'Show offers' }).waitFor();
    assert.deepEqual(errors, []);
    return {
        total: page.getByRole('combobox', { name: 'Minimum total cash back' }),
        rate: page.getByRole('combobox', { name: 'Minimum percent back' }),
        sort: page.getByRole('combobox', { name: 'Sort offers' }),
        keep: page.getByRole('checkbox', { name: 'Keep offers with no listed value' }),
        tab: name => page.getByRole('radio', { name })
    };
}
const shownMerchants = page => page.locator('#offers .offer-merchant').allInnerTexts();
const summary = page => page.locator('#hub-view-summary').innerText();
const tabCounts = page => page.locator('.hub-view-count').allInnerTexts();

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

        let controls = await openDeals(page, errors);
        await page.clock.runFor(60000);
        assert.equal(requests.length, 0, 'the list options send nothing on their own');
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        for (let turn = 0; turn < 60 && !/Scan complete/.test(await page.getByRole('status').innerText()); turn++) await page.clock.runFor(1000);

        // To add is the default tab, best value first, every row shows its value.
        assert.equal(await controls.tab('Show offers to add').isChecked(), true);
        assert.deepEqual(await tabCounts(page), ['4', '1', '5']);
        assert.deepEqual(await shownMerchants(page), ['Example Fixed', 'Example Percent', 'Example Small', 'Example Unknown']);
        assert.deepEqual(await page.locator('#offers .offer-worth').allInnerTexts(),
            ['$15 back on $75 (20%)', '9% back · no cap listed', '2% back · no cap listed', 'No listed value']);
        assert.equal(await controls.keep.isVisible(), false, 'the unlisted option appears only with a minimum');

        const scanned = requests.length;
        await page.getByRole('checkbox', { name: 'Confirm activation for current Deals profile' }).check();
        await controls.rate.selectOption({ label: 'Rate 5%+' });
        assert.deepEqual(await shownMerchants(page), ['Example Fixed', 'Example Percent', 'Example Unknown']);
        assert.equal(await summary(page), '1 offer below your minimum is hidden; Add skips it. 1 offer with no listed value is kept.');
        assert.match(await page.locator('#add').innerText(), /\(3\)/);
        await controls.total.selectOption({ label: 'Total $20+' });
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Unknown'], 'no cap listed counts as no listed total');
        assert.equal(await summary(page), '2 offers below your minimum are hidden; Add skips them. 2 offers with no listed value are kept.');
        assert.deepEqual(await tabCounts(page), ['2', '1', '3']);
        assert.match(await page.locator('#add').innerText(), /\(2\)/, 'Add counts only the offers still shown');
        mkdirSync(SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: resolve(SCREENSHOTS, 'offer-view.png') });

        await controls.keep.uncheck();
        assert.deepEqual(await shownMerchants(page), []);
        assert.equal(await page.locator('#offers .hub-empty-note').innerText(), 'All 4 offers here are hidden by your minimum value. Lower it to see them.');
        assert.equal(await page.locator('#hub-action-reason').innerText(), 'Your minimum value hides all 4 offers you could add. Lower it below to add them.');
        assert.equal(await page.locator('#add').isDisabled(), true);
        await controls.keep.check();
        assert.equal(requests.length, scanned, 'list options are local');

        await page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        for (let turn = 0; turn < 120 && !/Finished/.test(await page.getByRole('status').innerText()); turn++) await page.clock.runFor(1000);
        assert.match(await page.getByRole('status').innerText(), /Finished: 2 of 2 added\./);
        assert.deepEqual(requests.filter(request => request.method === 'PUT').map(request => request.path),
            ['/api/activate-offer/101', '/api/activate-offer/104'], 'Add all skips the hidden small offers');
        assert.equal(await page.locator('#offers .hub-empty-note').innerText(), 'All 2 offers here are hidden by your minimum value. Lower it to see them.');
        assert.deepEqual(await tabCounts(page), ['0', '3', '3']);
        await controls.tab('Show all offers').check();
        assert.deepEqual(await shownMerchants(page), ['Example Added', 'Example Percent', 'Example Unknown']);
        const added = requests.length;

        await page.reload();
        controls = await openDeals(page, errors);
        await page.clock.runFor(60000);
        assert.equal(requests.length, added, 'reload restores without requests');
        assert.equal(await controls.total.inputValue(), '20');
        assert.equal(await controls.rate.inputValue(), '5');
        assert.equal(await controls.tab('Show all offers').isChecked(), true);
        assert.deepEqual(await shownMerchants(page), ['Example Added', 'Example Percent', 'Example Unknown'], 'saved options and rewards restored');

        await controls.total.selectOption({ label: 'Any total' });
        await controls.rate.selectOption({ label: 'Any rate' });
        assert.equal(await controls.keep.isVisible(), false);
        assert.equal(await page.locator('#hub-view-summary').isHidden(), true);
        await controls.tab('Show offers to add').check();
        assert.deepEqual(await shownMerchants(page), ['Example Fixed', 'Example Small'], 'clearing the minimum brings the skipped offers back');
        assert.match(await page.locator('#add').innerText(), /\(2\)/);
        await controls.sort.selectOption({ label: 'Bank order' });
        await controls.tab('Show all offers').check();
        assert.deepEqual(await shownMerchants(page), ['Example Percent', 'Example Fixed', 'Example Small', 'Example Unknown', 'Example Added']);

        await page.setViewportSize({ width: 320, height: 700 });
        const overflow = await page.evaluate(() => {
            const panel = document.getElementById('bofa-offer-lite').shadowRoot.querySelector('.panel');
            return panel.scrollWidth - panel.clientWidth;
        });
        assert.ok(overflow <= 0, `list options fit a 320px viewport (overflow ${overflow}px)`);
        await page.screenshot({ path: resolve(SCREENSHOTS, 'offer-view-320.png') });
        assert.deepEqual(errors, []);
        await context.close();
        console.log('PASS: To add / Added / All tabs with counts, best-value sort, value on every row, minimums with summary, unlisted values kept or hidden, Add skips hidden offers and explains a 0 count, saved options after reload, local-only, 320px width.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
