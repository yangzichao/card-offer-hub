const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { confirmation } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');
const { launchRealTabBrowser } = require('./helpers/real-tab-browser.cjs');

async function run() {
    const headed = process.env.HEADFUL_TAB_TEST === '1';
    const realTabs = headed ? await launchRealTabBrowser(chromium) : null;
    const browser = realTabs?.browser || await chromium.launch({ headless: true });
    try {
        const context = realTabs?.context || await browser.newContext({ viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        const requests = [], errors = [];
        let heldRequest;
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install();
        await context.route('**/*', async route => {
            if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><body><h1>Synthetic tab-switch regression</h1></body>' });
            assert.match(route.request().url(), /CreateCardAccountOfferEnrollment/);
            const payload = route.request().postDataJSON();
            requests.push(payload);
            await page.evaluate(count => { window.sentEnrollments = count; }, requests.length);
            if (requests.length === 1) { heldRequest = route; return; }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(confirmation(payload.identifier, { accountNumberProxy: payload.accountNumberProxy })) });
        });
        await page.goto('https://global.americanexpress.com/offers');
        const storage = new Map([
            ['card_offer_hub_amex_saved_cards_v1', { schemaVersion: 2, detected: true,
                accounts: [{ token: 'card-a', cardName: 'Selected card' }, { token: 'card-b', cardName: 'Unselected card' }],
                whitelist: ['card-a'], priorityOrder: ['card-a', 'card-b'] }],
            ['card_offer_hub_amex_saved_offers_v1', { schemaVersion: 1, cards: ['card-a', 'card-b'].map(accountToken => ({
                accountToken, complete: true, scannedAt: Date.now(), offers: ['Alpha', 'Beta', 'Gamma'].map(name => ({
                    id: name.toLowerCase(), name, description: 'Synthetic savings', expiry: '2026-12-31',
                    type: 'MERCHANT', status: 'ELIGIBLE', enrollable: true, groupKey: name
                }))
            })) }]
        ]);
        const fixture = await createBrowserStorageFixture(page, storage);
        await fixture.restore();
        const source = readFileSync(process.env.AMEX_BULK_SCRIPT_PATH || resolve(__dirname, '../../dist/amex-offer-lite.user.js'), 'utf8');
        await page.addScriptTag({ content: source });
        const other = await context.newPage();
        await other.goto('https://example.test/other-tab');
        // Playwright forces every page focused by default. Turn that off so the
        // headed regression observes real hidden/visible browser tab changes.
        for (const tab of [page, other]) {
            const session = await context.newCDPSession(tab);
            await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
        }
        const switchTabs = async () => {
            await other.bringToFront();
            if (headed) await page.waitForFunction(() => document.visibilityState === 'hidden');
            await page.bringToFront();
            if (headed) await page.waitForFunction(() => document.visibilityState === 'visible');
            await page.clock.runFor(1500); // Also exercise the periodic control refresh.
        };
        await switchTabs();
        const bulk = page.locator('#btn-enroll-all');
        assert.equal(await bulk.innerText(), 'Add all offers (3)');
        await page.getByRole('searchbox').fill('Alpha');
        await switchTabs();
        assert.equal(await page.locator('.offer').count(), 1);
        assert.equal(await bulk.innerText(), 'Add all offers (3)', 'tab return and a one-result search must not narrow the bulk action');
        assert.equal(requests.length, 0, 'switching tabs cannot start anything');
        await bulk.click();
        await page.waitForFunction(() => window.sentEnrollments === 1);
        await switchTabs();
        assert.equal(await bulk.getAttribute('aria-label'), 'Add all offers');
        assert.equal(await bulk.isDisabled(), true);
        assert.match(await page.locator('#hub-action-reason').innerText(), /Adding 0 of 3/);
        await page.getByRole('searchbox').fill('Gamma');
        // A bank SPA replacing the panel must preserve the in-memory run too.
        await page.evaluate(() => document.getElementById('amex-offer-lite-ui').remove());
        await page.locator('#btn-enroll-all').waitFor();
        assert.equal(await page.getByRole('searchbox').inputValue(), 'gamma');
        assert.match(await page.locator('#hub-action-reason').innerText(), /Adding 0 of 3/);
        await heldRequest.fulfill({ contentType: 'application/json', body: JSON.stringify(confirmation('alpha', { accountNumberProxy: 'card-a' })) });
        for (let step = 0; step < 5; step++) await page.clock.runFor(1000);
        await page.waitForFunction(() => window.sentEnrollments === 3);
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes('Enrollment complete'));
        assert.deepEqual(requests.map(request => request.identifier), ['alpha', 'beta', 'gamma']);
        assert.ok(requests.every(request => request.accountNumberProxy === 'card-a'));
        await switchTabs();
        assert.equal(await bulk.innerText(), 'Add all offers (0)');
        assert.equal(requests.length, 3, 'no replay after returning to the tab');
        await page.getByRole('button', { name: 'Clear search', exact: true }).click();
        mkdirSync(resolve(__dirname, '../../work/browser'), { recursive: true });
        await page.screenshot({ path: resolve(__dirname, '../../work/browser/unified-workflow-amex.png') });
        assert.deepEqual(errors, []);
        console.log(`PASS: ${headed ? 'visible/hidden real browser tabs' : 'browser tab round-trip'}, filter-independent Add all, frozen in-flight scope, remount, whitelist-only requests and no replay.`);
    } finally { if (realTabs) await realTabs.close(); else await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
