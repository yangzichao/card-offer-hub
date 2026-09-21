const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const { verifyWorkspaceReload } = require('../helpers/browser-workspace.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { fixture } = require('./helpers/browser-fixture.cjs');

const script = readPublishedIssuerSource('citi-offer-lite');
const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });


async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const successful = await fixture(browser);
        const { page } = successful;
        await page.clock.runFor(60000);
        assert.equal(successful.requests.length, 0, 'installation must not initiate requests');
        await successful.selectCard();
        await page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        assert.equal(await page.getByRole('checkbox').first().isEnabled(), false);
        await page.getByRole('searchbox', { name: 'Search saved offers' }).fill('does-not-match');
        await successful.advanceUntil(/Finished: 2\/2/);
        assert.equal(successful.requests.length, 6, 'detect, scan every card, validation scan, two unique available offers');
        assert.equal(successful.maximumActive(), 1);
        assert.ok(successful.requests.filter(request => request.url.endsWith('/enrollMerchantOffer')).every(request => request.body.accountId === 'card-a'));
        assert.ok(successful.requests.slice(1).every((request, index) => request.time - successful.requests[index].time >= 500));
        await page.getByRole('searchbox', { name: 'Search saved offers' }).fill('');
        assert.equal(await page.locator('.offer').count(), 3);
        assert.deepEqual(successful.errors, []);
        await page.screenshot({ path: resolve(outputDirectory, 'citi-enrollment-complete.png') });
        await verifyWorkspaceReload({ page: page, script, id: 'citi-offer-lite', bank: 'Citi', requests: successful.requests, activationName: 'Add all offers' });
        await page.getByRole('button', { name: 'Minimize Citi panel' }).click();
        assert.equal(await page.getByRole('button', { name: 'Refresh all cards & offers' }).isVisible(), false);
        await page.getByRole('button', { name: 'Expand Citi panel' }).click();
        await successful.context.close();

        for (const mode of ['unconfirmed', '429']) {
            const failed = await fixture(browser, mode);
            await failed.selectCard();
            await failed.page.getByRole('button', { name: 'Add all offers', exact: true }).click();
            await failed.advanceUntil(mode === '429' ? /HTTP 429/ : /not explicitly confirmed/);
            assert.equal(failed.requests.length, 5);
            assert.equal(await failed.page.getByRole('button', { name: 'Add all offers' }).isEnabled(), false);
            await failed.page.clock.runFor(60000);
            assert.equal(failed.requests.length, 5, 'errors never trigger an automatic retry');
            if (mode === '429') {
                await failed.page.getByRole('button', { name: 'Refresh all cards & offers' }).click();
                await failed.advanceUntil(/Rate limited/);
                assert.equal(failed.requests.length, 5, 'cooldown blocks manual scans too');
            }
            assert.deepEqual(failed.errors, []);
            await failed.context.close();
        }

        const cancelled = await fixture(browser);
        await cancelled.selectCard();
        await cancelled.page.getByRole('button', { name: 'Add all offers' }).click();
        await cancelled.page.getByRole('button', { name: 'Stop' }).click();
        await cancelled.advanceUntil(/Stopped/);
        assert.equal(cancelled.requests.length, 3, 'stop during pacing must prevent the validation scan');
        assert.deepEqual(cancelled.errors, []);
        await cancelled.context.close();
        console.log('Citi browser regression passed: manual start, selected cards, serial pacing, success, unknown response, 429, cancellation, search, panel controls.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
