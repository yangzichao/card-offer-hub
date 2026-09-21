const { fixture, script } = require('./helpers/browser-fixture.cjs');
const { verifyWorkspaceReload } = require('../helpers/browser-workspace.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });
async function loadCards(fixture) {
    await fixture.page.getByRole('button', { name: 'Load cards & offers', exact: true }).click();
    await fixture.advanceUntil(/Loaded 2 cards/);
    assert.equal(await fixture.page.getByRole('checkbox', { checked: true }).count(), 2);
}
async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        await successful.page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0);
        assert.equal(await successful.page.getByRole('button', { name: 'Detect cards' }).count(), 0);
        await successful.captureNativeRequest();
        assert.equal(successful.requests.length, 1, 'native observation does not scan');
        await loadCards(successful);
        const scans = successful.requests.filter(request => !request.native);
        assert.deepEqual(scans.map(request => request.accountIdentifier), ['101', '202']);
        assert.ok(scans[1].time - scans[0].time >= 500);
        assert.equal(successful.requests.filter(request => request.click).length, 0, 'initial load never adds');
        await successful.page.getByRole('searchbox').fill('does-not-match');
        await successful.page.getByRole('button', { name: 'Add saved offers', exact: true }).click();
        await successful.advanceUntil(/Finished: 4 offers confirmed added/);
        assert.equal(successful.requests.filter(request => request.click).length, 4, 'search does not shrink scope');
        const saved = await successful.page.evaluate(() => GM_getValue('chase-offer-lite:workspace'));
        assert.ok(saved.offers.every(row => row.status === 'ACTIVATED'));
        assert.doesNotMatch(JSON.stringify(saved), /synthetic-session|synthetic-impression|activationParameters/);
        await successful.page.getByRole('searchbox').fill('');
        await successful.page.screenshot({ path: resolve(outputDirectory, 'chase-saved-offers.png') });
        await verifyWorkspaceReload({ page: successful.page, script, id: 'chase-offer-lite', bank: 'Chase',
            requests: successful.requests, activationName: 'Add saved offers', documentStart: true, cacheNotice: /Offers last refreshed/ });
        assert.deepEqual(successful.errors, []);
        await successful.context.close();

        const reopened = await fixture(browser);
        await reopened.captureNativeRequest('xhr', false);
        await loadCards(reopened);
        await reopened.page.getByRole('checkbox', { name: 'Select Synthetic Card B · 0000', exact: true }).uncheck();
        await reopened.page.evaluate(() => sessionStorage.setItem('__fixtureUserscriptStorage', JSON.stringify(window.fixtureStorage)));
        const beforeReload = reopened.requests.length;
        await reopened.page.reload();
        await reopened.page.clock.runFor(60000);
        assert.equal(reopened.requests.length, beforeReload, 'reopening restores without requests');
        assert.equal(await reopened.page.getByRole('button', { name: 'Add saved offers', exact: true }).isEnabled(), true);
        // Native page traffic re-establishes this tab's current session.
        await reopened.page.evaluate(async ({ url, headers }) => { await fetch(url, { headers }); }, {
            url: require('./fixtures/offers-response.cjs').endpoint + '?native-fixture=true',
            headers: require('./fixtures/offers-response.cjs').sessionHeaders()
        });
        await reopened.page.getByRole('button', { name: 'Add saved offers', exact: true }).click();
        await reopened.advanceUntil(/Finished: 2 offers confirmed added/);
        assert.deepEqual(reopened.requests.filter(request => request.click).map(request => request.accountIdentifier), ['101', '101']);
        const startRefresh = reopened.requests.length;
        await reopened.page.getByRole('button', { name: 'Refresh & add offers', exact: true }).click();
        await reopened.advanceUntil(/Finished: 0 offers confirmed added/);
        assert.deepEqual(reopened.requests.slice(startRefresh).map(request => request.accountIdentifier), ['101', '202'], 'refresh includes deselected cards without adding them');
        assert.equal(await reopened.page.getByRole('checkbox', { name: 'Select Synthetic Card B · 0000', exact: true }).isChecked(), false);
        await reopened.page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await reopened.page.locator('.panel').evaluate(panel => panel.scrollWidth > panel.clientWidth), false);
        await reopened.page.screenshot({ path: resolve(outputDirectory, 'chase-saved-offers-mobile.png') });
        assert.deepEqual(reopened.errors, []);
        await reopened.context.close();

        const unconfirmed = await fixture(browser, 'unconfirmed');
        await unconfirmed.captureNativeRequest();
        await loadCards(unconfirmed);
        await unconfirmed.page.getByRole('checkbox', { name: 'Select Synthetic Card B · 0000', exact: true }).uncheck();
        await unconfirmed.page.getByRole('button', { name: 'Add saved offers', exact: true }).click();
        await unconfirmed.advanceUntil(/did not confirm/);
        await unconfirmed.page.clock.runFor(60000);
        assert.equal(unconfirmed.requests.filter(request => request.click).length, 1);
        assert.equal(await unconfirmed.page.getByRole('button', { name: 'Add saved offers', exact: true }).isEnabled(), true);
        await unconfirmed.page.getByRole('button', { name: 'Add saved offers', exact: true }).click();
        await unconfirmed.advanceUntil(/Finished: 1 offers confirmed added/);
        assert.deepEqual(unconfirmed.requests.filter(request => request.click).map(request => request.offerId), ['a', 'b'], 'manual continuation skips the uncertain click');
        assert.deepEqual(unconfirmed.errors, []);
        await unconfirmed.context.close();

        for (const mode of ['429', 'partial', 'storage']) {
            const failed = await fixture(browser, mode);
            await failed.captureNativeRequest('xhr');
            await failed.page.getByRole('button', { name: 'Load cards & offers', exact: true }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : mode === 'partial' ? /partial|incomplete/ : /Cannot save/);
            await failed.page.clock.runFor(60000);
            assert.equal(failed.requests.filter(request => !request.native).length, mode === 'storage' ? 0 : 1);
            assert.equal(failed.requests.filter(request => request.click).length, 0);
            assert.equal(await failed.page.getByRole('checkbox').count(), 0, 'failed load cannot replace the workspace with partial results');
            if (mode === '429' || mode === 'storage') assert.equal(await failed.page.getByRole('button', { name: 'Load cards & offers', exact: true }).isEnabled(), false);
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }
        console.log('Chase browser regression passed: one-click load, saved continuation after reload/failure, refresh-all with selected-card writes, CORS readback, no retries, mobile layout and persistence.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
