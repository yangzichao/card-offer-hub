const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { rawOffer, hubResponse, confirmation } = require('./fixtures/synthetic-offers.cjs');
const { createBrowserStorageFixture } = require('./helpers/browser-storage.cjs');

const SHARED_SETTLED_TITLE = 'Xero · shared synthetic offer';
const SHARED_OPEN_TITLE = 'Acme · shared synthetic offer';
const CARD_ZERO_TITLE = 'Zephyr · only on card 0';

// Cards 0-4 can still take both shared offers. Cards 5-6 already have the Xero
// offer, which must stop it from being added anywhere else.
function offersForCard(cardNumber, requestType) {
    const settled = (status) => rawOffer(`xero-${cardNumber}`, status, { title: SHARED_SETTLED_TITLE, shortDescription: 'Earn 75% back, up to $200' });
    if (requestType === 'ADDEDTOCARD_LANDING') {
        return hubResponse('addedToCardViewAll', cardNumber >= 5 ? [settled('ENROLLED')] : []);
    }
    if (cardNumber >= 5) return hubResponse('recommendedOffers', []);
    const offers = [settled('NOT_ENROLLED'), rawOffer(`acme-${cardNumber}`, 'NOT_ENROLLED', { title: SHARED_OPEN_TITLE, shortDescription: 'Earn $40 back' })];
    if (cardNumber === 0) offers.push(rawOffer('card-zero-offer', 'NOT_ENROLLED', { title: CARD_ZERO_TITLE }));
    return hubResponse('recommendedOffers', offers);
}

const waitForStatus = (page, expected) => page.waitForFunction((text) =>
    document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.startsWith(text), expected);

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1080 } });
        const errors = [];
        const scanRequests = [];
        const enrollmentRequests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-09-10T12:00:01Z'));
        await page.route('**/*', async (route) => {
            const request = route.request();
            if (request.isNavigationRequest()) {
                await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>Seven-card regression</title><body style="background:#edf1f5;font-family:sans-serif"><h1 style="margin:40px">Seven synthetic cards · priority allocation</h1></body>' });
                return;
            }
            const payload = request.postDataJSON();
            if (request.url().endsWith('/CreateCardAccountOfferEnrollment.v1')) {
                enrollmentRequests.push({ payload, startedAt: await page.evaluate(() => Date.now()) });
                await page.evaluate((count) => { window.__testEnrollmentRequests = count; }, enrollmentRequests.length);
                await route.fulfill({ contentType: 'application/json',
                    body: JSON.stringify(confirmation(payload.identifier, { accountNumberProxy: payload.accountNumberProxy })) });
                return;
            }
            assert.match(request.url(), /^https:\/\/functions\.americanexpress\.com\/ReadOffersHubPresentation.web.v1$/);
            scanRequests.push(payload);
            await route.fulfill({ contentType: 'application/json',
                body: JSON.stringify(offersForCard(Number(payload.accountNumberProxy.replace('card-', '')), payload.requestType)) });
        });
        await page.goto('https://global.americanexpress.com/offers');
        await page.evaluate(() => {
            window.__INITIAL_STATE__ = { accounts: Array.from({ length: 7 }, (_, index) => ({
                account_token: `card-${index}`, product: { description: `Test card ${index}` },
                account: { display_account_number: `1000${index}` }
            })) };
        });
        const userscript = readFileSync(resolve(__dirname, '../../dist/amex-offer-lite.user.js'), 'utf8');
        const storageFixture = await createBrowserStorageFixture(page);
        await storageFixture.restore();
        await page.addScriptTag({ content: userscript });
        await page.getByRole('button', { name: 'Detect cards', exact: true }).click();
        for (let index = 0; index < 7; index++) await page.getByRole('checkbox', { name: `Whitelist Test card ${index} · (1000${index})`, exact: true }).check();
        assert.deepEqual(await page.locator('.card-rank').allTextContents(), ['1', '2', '3', '4', '5', '6', '7']);

        await page.getByRole('button', { name: 'Scan offers', exact: true }).click();
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.getElementById('status').textContent.includes('Waiting'));
        for (let index = 0; index < 14; index++) await page.clock.runFor(16000);
        await waitForStatus(page, 'Scan complete: 7/7');
        assert.equal(scanRequests.length, 14);
        assert.equal(new Set(scanRequests.map((request) => request.accountNumberProxy)).size, 7);
        assert.equal(await page.locator('.card-report').filter({ hasText: /^Complete$/ }).count(), 7);
        assert.match(await page.locator('.card').filter({ hasText: 'Test card 0' }).textContent(), /3 eligible · 0 added · 3 total/);
        assert.match(await page.locator('.card').filter({ hasText: 'Test card 3' }).textContent(), /2 eligible · 0 added · 2 total/);
        assert.match(await page.locator('.card').filter({ hasText: 'Test card 6' }).textContent(), /0 eligible · 1 added · 1 total/);
        assert.equal(await page.locator('.offer').count(), 3);
        assert.match(await page.locator('#offer-summary').textContent(), /3 distinct offers · 3 eligible · 2 planned on one card each · 5 eligible cards/);

        // An offer two cards already carry is never handed to a third card.
        const settledOffer = page.locator('.offer').filter({ hasText: SHARED_SETTLED_TITLE });
        assert.equal(await settledOffer.locator('.offer-counts').textContent(), 'Eligible on 5 cards · Added on 2 · Seen on 7');
        assert.match(await settledOffer.locator('.offer-target').textContent(), /^Already on Test card 5 · \(10005\) · no other card will be used/);
        assert.equal(await settledOffer.getByRole('button', { name: 'Added', exact: true }).isDisabled(), true);

        // A shared offer no card has yet goes to the highest-priority eligible card.
        const openOffer = page.locator('.offer').filter({ hasText: SHARED_OPEN_TITLE });
        assert.match(await openOffer.locator('.offer-target').textContent(), /^Goes to Test card 0 · \(10000\) · 4 other eligible cards are skipped$/);
        const screenshotPath = resolve(__dirname, '../../work/browser');
        mkdirSync(screenshotPath, { recursive: true });
        await page.screenshot({ path: resolve(screenshotPath, 'seven-card-counts.png') });

        // Promoting card 3 to the top re-targets every shared offer it is eligible for.
        // Real drag-and-drop is covered in browser-persistence.cjs, where the list
        // is short enough for both rows to be on screen at once.
        for (let step = 0; step < 3; step++) {
            await page.getByRole('button', { name: 'Move Test card 3 · (10003) up in offer priority', exact: true }).click();
        }
        await page.waitForFunction(() => document.getElementById('amex-offer-lite-ui').shadowRoot.querySelector('.card').textContent.includes('Test card 3'));
        assert.deepEqual(await page.locator('.card-rank').allTextContents(), ['1', '2', '3', '4', '5', '6', '7']);
        assert.equal(scanRequests.length, 14, 'reordering must not call APIs');
        assert.match(await openOffer.locator('.offer-target').textContent(), /^Goes to Test card 3 · \(10003\) · 4 other eligible cards are skipped$/);
        assert.match(await page.locator('.offer').filter({ hasText: CARD_ZERO_TITLE }).locator('.offer-target').textContent(),
            /^Goes to Test card 0 · \(10000\)$/, 'a card-exclusive offer stays on its own card');
        await page.screenshot({ path: resolve(screenshotPath, 'priority-allocation.png') });

        // One unattended run: two offers, one request each, 0.5s apart, nothing overlapping.
        await page.clock.runFor(16000); // Clear the gap left over from the last scan response.
        await page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        await page.waitForFunction(() => window.__testEnrollmentRequests === 1);
        assert.equal(enrollmentRequests.length, 1);
        assert.equal(enrollmentRequests[0].payload.accountNumberProxy, 'card-3');
        assert.equal(enrollmentRequests[0].payload.identifier, 'acme-3');
        await waitForStatus(page, 'Waiting');
        await page.clock.runFor(499);
        assert.equal(enrollmentRequests.length, 1, 'the next offer waits the full gap');
        await page.clock.runFor(1);
        await page.waitForFunction(() => window.__testEnrollmentRequests === 2);
        assert.equal(enrollmentRequests[1].payload.accountNumberProxy, 'card-0');
        assert.equal(enrollmentRequests[1].payload.identifier, 'card-zero-offer');
        assert.ok(enrollmentRequests[1].startedAt - enrollmentRequests[0].startedAt >= 500);
        await waitForStatus(page, 'Enrollment complete. 2 offers added');
        assert.equal(await openOffer.locator('.offer-counts').textContent(), 'Eligible on 4 cards · Added on 1 · Seen on 5');
        assert.match(await openOffer.locator('.offer-target').textContent(), /^Already on Test card 3 · \(10003\) · no other card will be used/);

        // Nothing is left to add, so the button is disabled and a rerun sends nothing.
        assert.equal(await page.getByRole('button', { name: 'Add all offers', exact: true }).isDisabled(), true);
        await page.clock.runFor(60000);
        assert.equal(enrollmentRequests.length, 2);
        assert.deepEqual(errors, []);
        console.log('PASS: seven-card scan, cross-card counts, reordered priority re-targeting shared offers, one-card-per-offer allocation, serial 0.5s enrollment, and no repeat run.');
    } finally {
        await browser.close();
    }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
