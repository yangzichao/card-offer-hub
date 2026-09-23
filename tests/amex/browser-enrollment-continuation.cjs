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

// Synthetic answers modelled on the 2026-09-10 enrollment captures.
const enrollmentAnswers = {
    cafe: { isEnrolled: false, explanationCode: 'PZN4107', explanationMessage: 'Card member Already added the offer on another card' },
    books: { isEnrolled: false },
    market: null
};

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
                response = enrollmentAnswers[payload.identifier] || confirmation(payload.identifier);
            } else if (payload.requestType === 'OFFERSHUB_LANDING') {
                response = hubResponse('recommendedOffers', [
                    rawOffer('cafe', 'NOT_ENROLLED', { title: 'Example Café' }),
                    rawOffer('books', 'NOT_ENROLLED', { title: 'Example Bookstore' }),
                    rawOffer('market', 'NOT_ENROLLED', { title: 'Example Market' })
                ]);
            } else {
                response = hubResponse('addedToCardViewAll', []);
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
        });
        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate(() => {
            window.__INITIAL_STATE__ = { accounts: [
                { account_token: 'card-a', product: { description: 'Gold' }, profile: { first_name: 'TEST A' },
                    account: { display_account_number: '10001' }, status: { account_status: ['Active'] } },
                { account_token: 'card-canceled', product: { description: 'Green' }, profile: { first_name: 'TEST C' },
                    account: { display_account_number: '10003' }, status: { account_status: ['Canceled'] } }
            ] };
        });
        const storageFixture = await createBrowserStorageFixture(page);
        await storageFixture.restore();
        await page.addScriptTag({ content: userscript });
        const status = page.locator('#amex-offer-lite-ui').locator('#status');
        async function advanceUntil(pattern) {
            for (let turn = 0; turn < 120; turn++) {
                if (pattern.test(await status.innerText())) return;
                await page.clock.runFor(500);
            }
            throw new Error(`Did not reach ${pattern}: ${await status.innerText()}`);
        }

        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        await page.getByRole('checkbox', { name: /Whitelist Gold/ }).waitFor();
        assert.equal(await page.getByRole('checkbox', { name: /Whitelist Green/ }).count(), 0, 'a canceled card is never listed');
        await page.getByRole('checkbox', { name: /Whitelist Gold/ }).check();
        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await advanceUntil(/^Scan complete/);

        await page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        await advanceUntil(/^Enrollment complete/);
        assert.deepEqual(enrollmentRequests.sort(), ['books', 'cafe', 'market'], 'the run continues past both non-additions, once each');
        assert.equal(await status.innerText(), 'Enrollment complete. 1 offers added · 1 already on another card · 1 declined by Amex.');

        const onOtherCard = page.getByRole('button', { name: 'Added on another card', exact: true });
        assert.equal(await onOtherCard.count(), 1);
        assert.equal(await onOtherCard.isDisabled(), true);
        assert.equal(await page.getByText('Gold · TEST A · (10001) · On another card', { exact: true }).count(), 1);
        assert.equal(await page.getByText('Amex says it is already on another of your cards · no other card will be used for this offer', { exact: true }).count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Added', exact: true }).count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Add all offers', exact: true }).isDisabled(), true, 'nothing is left to retry');
        await page.screenshot({ path: resolve(screenshotDirectory, 'amex-enrollment-continuation.png') });

        await page.clock.runFor(60000);
        assert.equal(enrollmentRequests.length, 3, 'no automatic retry after the run');
        assert.deepEqual(errors, []);
        console.log('PASS: canceled cards hidden, Add all continues past an on-another-card answer and a decline, each sent once, with distinct labels.');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
