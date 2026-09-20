const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { rawOffer, hubResponse, confirmation } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');

const projectRoot = resolve(__dirname, '../..');
const userscript = readPublishedIssuerSource('amex-offer-lite');
const screenshotDirectory = resolve(projectRoot, 'work/browser');
mkdirSync(screenshotDirectory, { recursive: true });

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
        const errors = [];
        const requests = [];
        let rateLimitMode = false;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-10T12:00:01Z'));
        await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Synthetic Amex fixture</title><body style="background:#edf1f5;font-family:sans-serif"><h1 style="margin:40px">Amex fixture · synthetic data only</h1></body>' });
                return;
            }
            if (!request.url().startsWith('https://functions.americanexpress.com/')) {
                await route.abort();
                throw new Error(`Unexpected request: ${request.url()}`);
            }
            const payload = request.postDataJSON();
            requests.push({ url: request.url(), payload, time: await page.evaluate(() => Date.now()) });
            if (rateLimitMode) {
                await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '300' }, body: '{}' });
                return;
            }
            let response;
            if (request.url().includes('CreateCardAccountOfferEnrollment')) response = confirmation(payload.identifier);
            else if (payload.requestType === 'OFFERSHUB_LANDING') response = hubResponse('recommendedOffers', [
                rawOffer('cafe', 'NOT_ENROLLED', { title: 'Example Café' }),
                rawOffer('books', 'NOT_ENROLLED', { title: 'Example Bookstore' }),
                rawOffer('travel', 'NOT_ENROLLED', { title: 'Card travel benefit', offerType: 'CARD', ctaDetails: { ctaType: 'STANDARD' } })
            ]);
            else response = hubResponse('addedToCardViewAll', [rawOffer('enrolled', 'ENROLLED', { title: 'Already added offer' })]);
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
        });
        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate(() => {
            window.__INITIAL_STATE__ = { accounts: [
                { account_token: 'card-a', product: { description: 'Gold' }, profile: { first_name: 'TEST A' }, account: { display_account_number: '10001' } },
                { account_token: 'card-b', product: { description: 'Platinum' }, profile: { first_name: 'TEST B' }, account: { display_account_number: '10002' } }
            ] };
        });
        const storageFixture = await createBrowserStorageFixture(page);
        await storageFixture.restore();
        await page.addScriptTag({ content: userscript });
        await page.clock.runFor(5000);
        assert.equal(requests.length, 0, 'page load and UI timers must not call APIs');
        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        assert.equal(await page.getByRole('checkbox').count(), 2);
        assert.equal(await page.getByRole('button', { name: 'Detect cards', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Scan offers', exact: true }).isDisabled(), true);
        await page.getByRole('checkbox', { name: /Whitelist Gold/ }).check();
        assert.equal(requests.length, 0, 'whitelist editing must not call APIs');
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes('Waiting'));
        assert.equal(requests.length, 1);
        assert.equal(await page.getByRole('checkbox').first().isDisabled(), true);
        await page.clock.runFor(16000);
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.startsWith('Scan complete'));
        assert.equal(requests.length, 2);
        assert.ok(requests[1].time - requests[0].time >= 500);
        assert.ok(requests.every((request) => request.payload.accountNumberProxy === 'card-a'));
        assert.equal(await page.locator('.offer').count(), 4, 'both lists and informational offers should render');
        await page.screenshot({ path: resolve(screenshotDirectory, 'whitelist-scan.png') });

        // A queue result must survive filtering while the request is waiting.
        await page.getByRole('searchbox').fill('Example Café');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await page.getByRole('searchbox').fill('Bookstore');
        await page.clock.runFor(16000);
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.startsWith('Enrollment complete'));
        await page.getByRole('searchbox').fill('Example Café');
        assert.equal(await page.getByRole('button', { name: 'Added', exact: true }).count(), 1);
        await page.getByRole('searchbox').fill('');

        // Removing the panel simulates a SPA replacing the page body.
        const requestCountBeforeRemount = requests.length;
        await page.evaluate(() => document.getElementById('amex-offer-lite-ui').remove());
        await page.getByRole('button', { name: 'Detect cards', exact: true }).waitFor();
        assert.equal(await page.getByRole('checkbox', { name: /Whitelist Gold/ }).isChecked(), true);
        assert.equal(requests.length, requestCountBeforeRemount);

        // Cancel while rate spacing is active: no read or enrollment may start later.
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes('Waiting'));
        const requestCountBeforeStop = requests.length;
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await page.clock.runFor(16000);
        assert.equal(requests.length, requestCountBeforeStop);

        // 429 stops once, keeps the whitelist and requires a manual restart after cooldown.
        rateLimitMode = true;
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await page.clock.runFor(16000);
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes('HTTP 429'));
        const countAfter429 = requests.length;
        await page.clock.runFor(301000);
        assert.equal(requests.length, countAfter429, 'cooldown must never auto-resume');
        assert.equal(await page.getByRole('button', { name: 'Scan offers', exact: true }).isDisabled(), false);
        assert.equal(await page.getByRole('checkbox', { name: /Whitelist Gold/ }).isChecked(), true);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: resolve(screenshotDirectory, 'mobile-panel.png') });
        const bounds = await page.locator('.panel').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'panel must fit narrow screens');
        assert.deepEqual(errors, []);
        console.log('PASS: real Chromium UI, manual-only startup, whitelist-only requests, complete lists, 0.5s spacing, enrollment/filter state, SPA remount, cancellation, 429 cooldown, and narrow viewport.');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
