const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { rawOffer, hubResponse, confirmation } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');

const userscript = readPublishedIssuerSource('amex-offer-lite');
const screenshotDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(screenshotDirectory, { recursive: true });

// Amex's real 429 has no CORS headers, so page code sees only "Failed to fetch".
// Playwright's route.fulfill skips CORS checks and would expose the 429, so an
// aborted request stands in for it: the page gets the same TypeError.
const suspectedLimitMessage = 'Amex stopped answering ("Failed to fetch"), most likely its rate limit. '
    + 'Paused for the cooldown; later requests will be slower. No automatic retry was made.';

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
        const errors = [];
        const enrollmentRequests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-23T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-23T12:00:01Z'));
        await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Synthetic Amex fixture</title><body><h1>Amex fixture · synthetic data only</h1></body>' });
                return;
            }
            if (!request.url().startsWith('https://functions.americanexpress.com/')) {
                errors.push('Unexpected network destination');
                await route.abort();
                return;
            }
            const payload = request.postDataJSON();
            let response;
            if (request.url().includes('CreateCardAccountOfferEnrollment')) {
                enrollmentRequests.push(payload.identifier);
                if (enrollmentRequests.length === 2) {
                    await route.abort('failed');
                    return;
                }
                response = confirmation(payload.identifier);
            } else if (payload.requestType === 'OFFERSHUB_LANDING') {
                response = hubResponse('recommendedOffers', ['cafe', 'books', 'market', 'deli'].map((identifier) =>
                    rawOffer(identifier, 'NOT_ENROLLED', { title: `Example ${identifier}` })));
            } else {
                response = hubResponse('addedToCardViewAll', []);
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
        });
        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate(() => {
            window.__INITIAL_STATE__ = { accounts: [
                { account_token: 'card-a', product: { description: 'Gold' }, profile: { first_name: 'TEST A' },
                    account: { display_account_number: '10001' }, status: { account_status: ['Active'] } }
            ] };
        });
        const storageFixture = await createBrowserStorageFixture(page);
        await storageFixture.restore();
        await page.addScriptTag({ content: userscript });
        const panel = page.locator('#amex-offer-lite-ui');
        const status = panel.locator('#status');
        const addAll = page.getByRole('button', { name: 'Add all offers', exact: true });
        async function advanceUntil(pattern) {
            for (let turn = 0; turn < 120; turn++) {
                if (pattern.test(await status.innerText())) return;
                await page.clock.runFor(500);
            }
            throw new Error(`Did not reach ${pattern}: ${await status.innerText()}`);
        }

        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        await page.getByRole('checkbox', { name: /Whitelist Gold/ }).check();
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await advanceUntil(/^Scan complete/);

        await addAll.click();
        await advanceUntil(/^Amex stopped answering/);
        assert.equal(await status.innerText(), `${suspectedLimitMessage} 1 offers added.`);
        assert.equal(enrollmentRequests.length, 2, 'nothing is sent after the failed request');
        assert.match(await panel.locator('#cooldown').innerText(), /^Cooling down: \d+s\. Restart manually afterward\.$/);
        assert.match(await panel.locator('#hub-pacing-details').textContent(), /^2\.00s after each response/, 'the learned gap doubled');
        assert.equal(await addAll.isDisabled(), true, 'Add all waits for the cooldown');
        assert.equal(await page.getByRole('button', { name: 'Rescan to verify', exact: true }).count(), 1, 'the failed offer is unconfirmed');
        await page.screenshot({ path: resolve(screenshotDirectory, 'amex-network-rate-limit.png') });

        await page.clock.runFor(60000);
        assert.equal(await addAll.isDisabled(), true);
        assert.equal(enrollmentRequests.length, 2, 'no automatic retry during the cooldown');
        await page.clock.runFor(61000);
        assert.equal(await panel.locator('#cooldown').innerText(), '');
        assert.equal(await addAll.isDisabled(), false);

        await addAll.click();
        await advanceUntil(/^Enrollment complete/);
        assert.equal(await status.innerText(), 'Enrollment complete. 2 offers added.');
        assert.deepEqual([...enrollmentRequests].sort(), ['books', 'cafe', 'deli', 'market'], 'resuming sends only the offers never tried, once each');
        await page.clock.runFor(60000);
        assert.equal(enrollmentRequests.length, 4, 'no automatic retry after the run');
        assert.deepEqual(errors, []);
        console.log('PASS: a failed fetch to the Amex gateway cools down, slows down, and Add all resumes the untried offers afterwards.');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
