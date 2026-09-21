const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { rawOffer, hubResponse, confirmation } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');

const userscript = readPublishedIssuerSource('amex-offer-lite');

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1080 } });
        const requests = [];
        const errors = [];
        const heldEnrollments = [];
        let scanMode = 'initial';
        let holdEnrollments = false;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-10T12:00:01Z'));
        await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Saved offers regression</title><body style="background:#edf1f5;font-family:sans-serif"><h1>Saved offers · synthetic data only</h1></body>' });
                return;
            }
            const payload = request.postDataJSON();
            requests.push(payload);
            assert.match(request.url(), /^https:\/\/functions\.americanexpress\.com\//);
            if (request.url().endsWith('/CreateCardAccountOfferEnrollment.v1')) {
                if (holdEnrollments) {
                    heldEnrollments.push(route);
                    await page.evaluate((count) => { window.__testPendingEnrollments = count; }, heldEnrollments.length);
                    return;
                }
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify(confirmation(payload.identifier, { accountNumberProxy: payload.accountNumberProxy })) });
                return;
            }
            if (scanMode === 'failed') {
                await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
                return;
            }
            const available = payload.requestType === 'OFFERSHUB_LANDING';
            const title = scanMode === 'fresh' ? 'Fresh offer' : 'Shared offer';
            const offers = available
                ? [rawOffer(`${title}-${payload.accountNumberProxy}`, 'NOT_ENROLLED', { title })]
                : scanMode === 'fresh' ? [] : [rawOffer(`added-${payload.accountNumberProxy}`, 'ENROLLED', { title: 'Already added' })];
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(hubResponse(available ? 'recommendedOffers' : 'addedToCardViewAll', offers)) });
        });
        const storageFixture = await createBrowserStorageFixture(page);
        const mount = async () => {
            await storageFixture.restore();
            await page.addScriptTag({ content: userscript });
        };
        const reload = async () => {
            await storageFixture.flush();
            await page.reload();
            await mount();
        };
        const waitForStatus = (text) => page.waitForFunction((expected) => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes(expected), text);
        const refreshOffers = async () => {
            await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
            for (let index = 0; index < 4; index++) await page.clock.runFor(16000);
            await waitForStatus('Scan complete: 2/2');
        };

        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate(() => {
            window.__INITIAL_STATE__ = { accounts: ['card-a', 'card-b'].map((token) => ({ account_token: token, product: { description: `Test ${token}` } })) };
        });
        await mount();
        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        await page.getByRole('checkbox').nth(0).check();
        await page.getByRole('checkbox').nth(1).check();
        await refreshOffers();
        assert.equal(requests.length, 4);
        const scanTimestamp = await page.locator('#saved-offers-status').textContent();

        await reload();
        await page.clock.runFor(5000);
        assert.equal(requests.length, 4, 'restoring offers must issue no requests');
        assert.equal(await page.locator('.offer').count(), 2);
        assert.equal(await page.locator('.card-counts').first().textContent(), '1 eligible · 1 added · 2 total');
        assert.equal(await page.locator('#saved-offers-status').textContent(), scanTimestamp);
        await page.getByRole('searchbox').fill('Shared offer');
        assert.equal(await page.locator('.offer-counts').textContent(), 'Eligible on 2 cards · Added on 0 · Seen on 2');
        assert.equal(await page.getByRole('button', { name: 'Add', exact: true }).isEnabled(), true);
        assert.match(await page.locator('.offer-target').textContent(), /^Goes to Test card-a · 1 other eligible card is skipped$/);
        const screenshotDirectory = resolve(__dirname, '../../work/browser');
        mkdirSync(screenshotDirectory, { recursive: true });
        await page.screenshot({ path: resolve(screenshotDirectory, 'restored-offers.png') });

        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await waitForStatus('Enrollment complete. 1 offers added');
        assert.equal(requests.length, 5, 'one card takes the shared offer, so one request goes out');
        await reload();
        await page.getByRole('searchbox').fill('Shared offer');
        assert.equal(await page.locator('.offer-counts').textContent(), 'Eligible on 1 cards · Added on 1 · Seen on 2');
        assert.match(await page.locator('.offer-target').textContent(), /^Already on Test card-a · no other card will be used/);
        assert.equal(await page.getByRole('button', { name: 'Added', exact: true }).isDisabled(), true);
        assert.equal(await page.locator('#saved-offers-status').textContent(), scanTimestamp);
        assert.equal(requests.length, 5);

        scanMode = 'failed';
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await page.clock.runFor(1000); // Reload now preserves the previous response's pacing deadline.
        await waitForStatus('HTTP 500');
        assert.equal(requests.length, 6);
        assert.equal(await page.locator('.offer').count(), 1, 'failed refresh keeps the filtered saved offer visible');
        await reload();
        assert.equal(await page.getByRole('searchbox').inputValue(), 'shared offer');
        assert.equal(await page.locator('.offer').count(), 1);
        await page.getByRole('searchbox').fill('');
        assert.equal(await page.locator('.offer').count(), 2);
        assert.equal(requests.length, 6);

        scanMode = 'fresh';
        await refreshOffers();
        assert.equal(requests.length, 10);
        await reload();
        assert.equal(await page.locator('.offer').count(), 1);
        assert.match(await page.locator('.offer-title').textContent(), /Fresh offer/);
        assert.equal(await page.getByRole('button', { name: 'Add', exact: true }).isEnabled(), true);

        // A document reload during enrollment cannot resurrect stale eligibility.
        holdEnrollments = true;
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await page.clock.runFor(1000);
        await page.waitForFunction(() => window.__testPendingEnrollments === 1);
        await reload();
        assert.equal(requests.length, 11);
        assert.equal(await page.getByRole('button', { name: 'Rescan to verify', exact: true }).isDisabled(), true);
        assert.equal(await page.locator('.badge.unconfirmed').count(), 1);
        assert.match(await page.locator('.offer-target').textContent(), /^Unconfirmed on Test card-a · no other card will be used/);
        assert.deepEqual(errors, []);
        console.log('PASS: offers/counts/timestamps restore after document reload with zero API requests, cached offers can enroll, per-card confirmations persist, failed refresh retains results, manual refresh replaces data, and interrupted enrollments restore as unconfirmed (Amex and GM simulated).');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
