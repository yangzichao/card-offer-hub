const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');
const { rawOffer, hubResponse, confirmation } = require('./fixtures/synthetic-offers.cjs');

const rawAccount = (token) => ({ account_token: token, product: { description: `Test ${token}` } });

function scanResponse(request) {
    const token = request.body.accountNumberProxy;
    return jsonResponse(request.body.requestType === 'OFFERSHUB_LANDING'
        ? hubResponse('recommendedOffers', [rawOffer(`shared-${token}`, 'NOT_ENROLLED', { title: 'Shared offer' })])
        : hubResponse('addedToCardViewAll', [rawOffer(`added-${token}`, 'ENROLLED', { title: 'Already added' })]));
}

async function savedScan(options = {}) {
    const harness = createUserscriptHarness(scanResponse, {
        initialState: { accounts: ['card-a', 'card-b'].map(rawAccount) }, ...options
    });
    harness.restoreLocalSettings();
    await harness.detectCards();
    harness.setCardWhitelisted('card-a', true);
    harness.setCardWhitelisted('card-b', true);
    await harness.startScan();
    return harness;
}

function reload(previousVisit, fetchResponse, options = {}) {
    const harness = createUserscriptHarness(fetchResponse, { userscriptStorage: previousVisit.userscriptStorage, ...options });
    harness.restoreLocalSettings();
    return harness;
}

test('reload restores every card offer, status, group and scan time with no requests or required rescan', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit);
    assert.equal(nextVisit.requests.length, 0);
    assert.equal(nextVisit.state.offersByAccount.size, 2);
    assert.equal(nextVisit.groupedOffers().length, 2);
    assert.equal(nextVisit.enrollmentCandidates().length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(nextVisit.accountOfferCounts('card-a'))), { total: 2, eligible: 1, enrolled: 1, complete: true });
    assert.equal(nextVisit.state.offerScanTimes.get('card-a'), previousVisit.state.offerScanTimes.get('card-a'));
    assert.match(nextVisit.state.status, /Saved offers restored/);
});

test('a restored shared offer is added to the top-priority card only and never repeats on a lower card', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit, (request) => jsonResponse(confirmation(request.body.identifier)));
    assert.deepEqual(Array.from(nextVisit.enrollmentPlan(), ({ account }) => account.token), ['card-a']);
    await nextVisit.startEnrollment();
    assert.equal(nextVisit.requests.length, 1, 'one card takes the shared offer, one request at a time');
    assert.equal(nextVisit.maximumActiveRequests(), 1);
    assert.equal(nextVisit.requests[0].body.accountNumberProxy, 'card-a');
    const afterEnrollment = reload(nextVisit);
    assert.equal(afterEnrollment.enrollmentPlan().length, 0, 'the offer is settled; card-b must not take it too');
    assert.equal(afterEnrollment.accountOfferCounts('card-a').enrolled, 2);
    assert.equal(afterEnrollment.accountOfferCounts('card-b').eligible, 1, 'the lower card keeps its own record unchanged');
    assert.equal(afterEnrollment.state.offerScanTimes.get('card-a'), previousVisit.state.offerScanTimes.get('card-a'));
    await afterEnrollment.startEnrollment();
    assert.equal(afterEnrollment.requests.length, 0, 'a second run sends nothing for an offer already added');
});

test('an enrollment interrupted by reload restores as unconfirmed, never as an eligible retry on another card', async () => {
    const previousVisit = await savedScan();
    const pending = [];
    const nextVisit = reload(previousVisit, (request) => new Promise((resolve) => pending.push({ request, resolve })));
    const run = nextVisit.startEnrollment();
    for (let index = 0; index < 30; index++) await Promise.resolve();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].request.body.accountNumberProxy, 'card-a');
    const interruptedVisit = reload(nextVisit);
    assert.equal(interruptedVisit.state.offersByAccount.get('card-a')[0].status, 'UNCONFIRMED');
    assert.equal(interruptedVisit.enrollmentCandidates().length, 1, 'card-b is still eligible on its own record');
    assert.equal(interruptedVisit.enrollmentPlan().length, 0, 'an unconfirmed card blocks the offer until a rescan settles it');
    pending[0].resolve(jsonResponse(confirmation(pending[0].request.body.identifier)));
    await run;
    const confirmedVisit = reload(nextVisit);
    assert.equal(confirmedVisit.state.offersByAccount.get('card-a')[0].status, 'ENROLLED');
    assert.equal(confirmedVisit.accountOfferCounts('card-a').enrolled, 2);
    assert.equal(confirmedVisit.enrollmentPlan().length, 0);
});

test('a failed refresh retains saved data and scan time without pretending it refreshed successfully', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit, () => jsonResponse({}, 500));
    await nextVisit.startScan();
    assert.equal(nextVisit.requests.length, 1);
    assert.equal(nextVisit.state.offersByAccount.get('card-a').length, 2);
    assert.equal(nextVisit.state.offerScanTimes.get('card-a'), previousVisit.state.offerScanTimes.get('card-a'));
    assert.match(nextVisit.state.scanReports.get('card-a'), /^Incomplete/);
    assert.equal(nextVisit.state.scanReports.get('card-b'), 'Complete', 'unattempted saved cards stay intact');
    const afterFailure = reload(nextVisit);
    assert.equal(afterFailure.state.offersByAccount.get('card-a').length, 2);
    assert.equal(afterFailure.accountOfferCounts('card-a').complete, false);
});

test('a malformed refresh view keeps the previous complete list and continues other cards', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit, (request) => request.body.requestType === 'ADDEDTOCARD_LANDING' ? jsonResponse({}) : scanResponse(request));
    await nextVisit.startScan();
    assert.equal(nextVisit.requests.length, 4);
    for (const account of nextVisit.state.accounts) {
        assert.equal(nextVisit.state.offersByAccount.get(account.token).length, 2);
        assert.equal(nextVisit.state.offerScanTimes.get(account.token), previousVisit.state.offerScanTimes.get(account.token));
        assert.match(nextVisit.state.scanReports.get(account.token), /previous saved offers/);
    }
});

test('successful manual refresh replaces old offers, including a legitimately empty list', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit, (request) => jsonResponse(hubResponse(request.body.requestType === 'OFFERSHUB_LANDING' ? 'recommendedOffers' : 'addedToCardViewAll', [])));
    nextVisit.advanceTime(3600000);
    await nextVisit.startScan();
    const refreshed = reload(nextVisit);
    assert.equal(refreshed.groupedOffers().length, 0);
    assert.equal(refreshed.state.scanReports.get('card-a'), 'Complete');
    assert.ok(refreshed.state.offerScanTimes.get('card-a') > previousVisit.state.offerScanTimes.get('card-a'));
});

test('whitelist removal and card-list refresh retain offers but never authorize excluded cards', async () => {
    const previousVisit = await savedScan();
    previousVisit.setCardWhitelisted('card-a', false);
    const nextVisit = reload(previousVisit, () => jsonResponse({ accounts: ['card-a', 'card-b'].map(rawAccount) }));
    assert.equal(nextVisit.state.offersByAccount.has('card-a'), true);
    assert.equal(nextVisit.enrollmentCandidates().length, 1);
    await nextVisit.detectCards({ forceRefresh: true });
    assert.equal(nextVisit.state.offersByAccount.size, 2);
    nextVisit.setCardWhitelisted('card-a', true);
    assert.equal(nextVisit.enrollmentCandidates().length, 2);
    assert.equal(nextVisit.requests.length, 1, 'reselecting never scans automatically');
});

test('first-time interrupted scan saves partial offers, and restoration does not unlock enrollment', async () => {
    const previousVisit = await savedScan({ onWait: (_, access) => access.cancelRun() });
    assert.equal(previousVisit.requests.length, 1);
    const nextVisit = reload(previousVisit);
    assert.equal(nextVisit.state.offersByAccount.get('card-a').length, 1);
    assert.equal(nextVisit.state.scanReports.get('card-a'), 'Incomplete');
    assert.equal(nextVisit.enrollmentCandidates().length, 0);
});

test('website storage clearing cannot erase saved offers, and no expiry triggers an automatic refresh', async () => {
    const previousVisit = await savedScan();
    const nextVisit = reload(previousVisit, undefined, { localStorageReadError: true });
    nextVisit.advanceTime(90 * 24 * 3600000);
    assert.equal(nextVisit.groupedOffers().length, 2);
    assert.equal(nextVisit.enrollmentCandidates().length, 2);
    assert.equal(nextVisit.requests.length, 0);
});

test('malformed offer snapshots do not erase valid cards or silently overwrite saved data', async () => {
    const previousVisit = await savedScan();
    previousVisit.userscriptStorage.set(previousVisit.SETTINGS.savedOffersKey, { schemaVersion: 1, cards: [{ accountToken: 'card-a', offers: [{}] }] });
    const original = structuredClone(previousVisit.userscriptStorage.get(previousVisit.SETTINGS.savedOffersKey));
    const nextVisit = reload(previousVisit);
    assert.equal(nextVisit.state.accounts.length, 2);
    assert.equal(nextVisit.state.whitelist.size, 2);
    assert.equal(nextVisit.state.offersByAccount.size, 0);
    assert.match(nextVisit.state.savedOffersError, /Could not restore/);
    assert.deepEqual(nextVisit.userscriptStorage.get(nextVisit.SETTINGS.savedOffersKey), original);
});

test('failed offer writes are visible and a failed enrollment checkpoint sends no requests', async () => {
    const previousVisit = await savedScan();
    const options = { userscriptStorage: previousVisit.userscriptStorage, storageWriteError: true };
    const nextVisit = createUserscriptHarness(scanResponse, options);
    nextVisit.restoreLocalSettings();
    await nextVisit.startScan();
    assert.match(nextVisit.state.savedOffersError, /Could not save offers/);
    const requestCount = nextVisit.requests.length;
    await nextVisit.startEnrollment();
    assert.equal(nextVisit.requests.length, requestCount);
    assert.equal(nextVisit.state.pendingEnrollments.size, 0);
    assert.match(nextVisit.state.status, /No enrollment request was sent/);
    assert.equal(reload(previousVisit).enrollmentCandidates().length, 2);
});

test('combination snapshots migrate legacy data and preserve a mismatched workflow even after a manual scan', async () => {
    const previous = await savedScan();
    const key = previous.SETTINGS.savedOffersKey;
    const saved = structuredClone(previous.userscriptStorage.get(key));
    assert.equal(saved.workflowType, 'amex-combination');
    const legacy = { ...saved, schemaVersion: 1 };
    delete legacy.workflowType;
    previous.userscriptStorage.set(key, legacy);
    const migrated = reload(previous);
    assert.equal(migrated.enrollmentPlan().length, 1);
    assert.equal(migrated.requests.length, 0);
    assert.deepEqual(previous.userscriptStorage.get(key), legacy);
    const mismatch = { ...saved, workflowType: 'per-card' };
    previous.userscriptStorage.set(key, mismatch);
    const blocked = reload(previous, scanResponse);
    assert.match(blocked.state.savedOffersError, /Could not restore/);
    await blocked.startScan();
    assert.deepEqual(previous.userscriptStorage.get(key), mismatch);
    const count = blocked.requests.length;
    await blocked.startEnrollment();
    assert.equal(blocked.requests.length, count, 'a mismatched snapshot cannot authorize enrollment');
});
