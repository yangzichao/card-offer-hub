const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { hubResponse } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');

const userscript = readPublishedIssuerSource('amex-offer-lite');
const rawAccount = (token) => ({ account_token: token, product: { description: `Test ${token}` } });

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
        const errors = [];
        const requests = [];
        let refreshFails = false;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-10T12:00:01Z'));
        await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Whitelist persistence regression</title><body><h1>Synthetic Amex fixture</h1></body>' });
                return;
            }
            requests.push({ url: request.url(), payload: request.postDataJSON() });
            if (request.url() === 'https://global.americanexpress.com/api/servicing/v1/member') {
                await route.fulfill({ contentType: 'application/json', status: refreshFails ? 500 : 200,
                    body: JSON.stringify({ accounts: ['card-a', 'card-b', 'new-card'].map(rawAccount) }) });
                return;
            }
            assert.match(request.url(), /^https:\/\/functions\.americanexpress\.com\/ReadOffersHubPresentation.web.v1$/);
            const section = request.postDataJSON().requestType === 'OFFERSHUB_LANDING' ? 'recommendedOffers' : 'addedToCardViewAll';
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(hubResponse(section, [])) });
        });
        const storageFixture = await createBrowserStorageFixture(page);
        const mountUserscript = async () => {
            await storageFixture.restore();
            await page.addScriptTag({ content: userscript });
        };
        const reloadUserscript = async () => {
            await storageFixture.flush();
            await page.reload();
            await mountUserscript();
        };
        const checkbox = (token) => page.getByRole('checkbox', { name: `Whitelist Test ${token}`, exact: true });
        const scanButton = (count) => page.getByRole('button', { name: 'Scan offers', exact: true });
        const waitForStatus = (text) => page.waitForFunction((expected) => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes(expected), text);

        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate((accounts) => { window.__INITIAL_STATE__ = { accounts }; }, ['card-a', 'card-b'].map(rawAccount));
        await mountUserscript();
        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        await checkbox('card-a').check();
        await storageFixture.flush();
        assert.equal(requests.length, 0);
        assert.match(await page.locator('#saved-cards-status').textContent(), /Saved in Tampermonkey/);

        // This is a real document reload, with no card data in the new document.
        await reloadUserscript();
        await page.clock.runFor(5000);
        assert.equal(await page.getByRole('checkbox').count(), 2);
        assert.equal(await checkbox('card-a').isChecked(), true);
        assert.equal(await checkbox('card-b').isChecked(), false);
        assert.equal(await scanButton(1).isEnabled(), true);
        assert.equal(requests.length, 0, 'restoration must issue no API requests');
        assert.match(await page.locator('#status').textContent(), /Restored 2 cards, 1 whitelist selections and your offer priority/);

        // Drag the second card above the first; the chosen order must survive a reload.
        assert.deepEqual(await page.locator('.card-rank').allTextContents(), ['1', '2']);
        const dragHandle = page.locator('.card').nth(1).locator('.drag-handle');
        const dropRow = page.locator('.card').nth(0);
        const handleBox = await dragHandle.boundingBox();
        const dropBox = await dropRow.boundingBox();
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.querySelector('.card').textContent.includes('Test card-b'));
        assert.equal(requests.length, 0, 'reordering must not call APIs');
        await reloadUserscript();
        await page.clock.runFor(5000);
        assert.match(await page.locator('.card').first().textContent(), /Test card-b/, 'the saved priority order is restored');
        assert.equal(await checkbox('card-a').isChecked(), true, 'reordering never changes the whitelist');
        // Put the original order back so the rest of this regression is unchanged.
        await page.getByRole('button', { name: 'Move Test card-a up in offer priority', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.querySelector('.card').textContent.includes('Test card-a'));
        assert.equal(requests.length, 0);

        await scanButton(1).click();
        await waitForStatus('Waiting');
        await page.clock.runFor(16000);
        await waitForStatus('Scan complete: 1/1');
        assert.equal(requests.length, 2);
        assert.ok(requests.every((request) => request.payload.accountNumberProxy === 'card-a'));

        // Explicit refresh makes one account request and preserves approvals.
        await page.getByRole('button', { name: 'Refresh cards', exact: true }).click();
        await page.clock.runFor(16000);
        await waitForStatus('Refreshed 3 cards');
        assert.equal(requests.length, 3);
        assert.equal(await checkbox('card-a').isChecked(), true);
        assert.equal(await checkbox('new-card').isChecked(), false);
        refreshFails = true;
        await page.getByRole('button', { name: 'Refresh cards', exact: true }).click();
        await page.clock.runFor(16000);
        await waitForStatus('previous cards and whitelist kept');
        assert.equal(requests.length, 4);
        assert.equal(await page.getByRole('checkbox').count(), 3);
        assert.equal(await checkbox('card-a').isChecked(), true);

        // A rejected write must be visible, and cannot mutate the saved snapshot.
        await page.evaluate(() => { window.__testStorageWriteFailure = true; });
        await checkbox('card-b').check();
        assert.match(await page.locator('#saved-cards-status').textContent(), /Could not save/);
        await reloadUserscript();
        assert.equal(await checkbox('card-b').isChecked(), false);

        // Clearing website data cannot remove userscript storage.
        await page.evaluate(() => localStorage.clear());
        await reloadUserscript();
        assert.equal(await checkbox('card-a').isChecked(), true);
        assert.equal(requests.length, 4);
        const screenshotDirectory = resolve(__dirname, '../../work/browser');
        mkdirSync(screenshotDirectory, { recursive: true });
        await page.screenshot({ path: resolve(screenshotDirectory, 'restored-whitelist.png') });

        // An intentional empty whitelist must not resurrect the old legacy list.
        await page.evaluate(() => localStorage.setItem('card_offer_hub_amex_whitelist_v1', '["card-a"]'));
        await checkbox('card-a').uncheck();
        await reloadUserscript();
        assert.equal(await checkbox('card-a').isChecked(), false);
        assert.equal(await scanButton(0).isDisabled(), true);
        assert.equal(requests.length, 4);
        assert.deepEqual(errors, []);
        console.log('PASS: real document reload restores cards/whitelist with zero API requests, immediate whitelist-only scan, explicit refresh, refresh failure preservation, visible save errors, website-storage independence, and persisted deselection (GM API simulated).');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
