const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer, confirmation } = require('./fixtures/synthetic-offers.cjs');

const OFFER_TITLES_BY_CARD = { 'card-a': ['Shared', 'Only A'], 'card-b': ['Shared', 'Only B'], 'card-c': ['Shared'] };

function preparedHarness(fetchResponse, options = {}) {
    const harness = createUserscriptHarness(fetchResponse, options);
    configureAccounts(harness, Object.keys(OFFER_TITLES_BY_CARD));
    for (const [accountToken, titles] of Object.entries(OFFER_TITLES_BY_CARD)) {
        harness.state.offersByAccount.set(accountToken, titles.map((title) =>
            harness.normalizeHubOffer(rawOffer(`${title}-${accountToken}`, 'NOT_ENROLLED', { title }))));
        harness.state.scanReports.set(accountToken, 'Complete');
    }
    return harness;
}

function confirmEveryRequest(request) {
    return jsonResponse(confirmation(request.body.identifier, { accountNumberProxy: request.body.accountNumberProxy }));
}

async function drainMicrotasks() {
    for (let index = 0; index < 30; index++) await Promise.resolve();
}

test('one run adds every planned offer, one request at a time, initially 1 second apart', async () => {
    const harness = preparedHarness(confirmEveryRequest);
    assert.deepEqual(Array.from(harness.enrollmentPlan(), ({ account, offer }) => `${offer.name}@${account.token}`),
        ['Only A@card-a', 'Shared@card-a', 'Only B@card-b']);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.maximumActiveRequests(), 1, 'nothing overlaps');
    const gaps = harness.requests.slice(1).map((request, index) => request.startedAt - harness.requests[index].startedAt);
    assert.ok(gaps.every((gap) => gap === 1000), `expected every gap to be exactly 1s, saw ${gaps}`);
    assert.match(harness.state.status, /Enrollment complete\. 3 offers added/);
    assert.equal(harness.state.busy, null);
    assert.equal(harness.state.offersByAccount.get('card-a')[0].status, 'ENROLLED');
    assert.equal(harness.state.offersByAccount.get('card-b')[0].status, 'ELIGIBLE', 'the lower card keeps its own record');
    assert.equal(harness.enrollmentPlan().length, 0, 'a second run has nothing left to add');
});

test('a run in progress locks the panel and cannot be started twice', async () => {
    const pending = [];
    const harness = preparedHarness((request) => new Promise((resolve) => pending.push({ request, resolve })));
    const run = harness.startEnrollment();
    await drainMicrotasks();
    assert.equal(harness.state.busy, 'enroll');
    await harness.startEnrollment();
    assert.equal(pending.length, 1, 'a second click while running sends nothing');
    harness.cancelRun();
    pending[0].resolve(confirmEveryRequest(pending[0].request));
    await run;
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.busy, null);
});

test('Stop during the gap between offers sends none of the remaining requests', async () => {
    const harness = preparedHarness(confirmEveryRequest, { onWait: (_, access) => access.cancelRun() });
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.offersByAccount.get('card-a')[1].status, 'ENROLLED', 'the offer already sent is kept');
    assert.match(harness.state.status, /Stopped.*1 offers added/);
    assert.equal(harness.state.requestInFlight, false);
});

test('Stop while a request is in flight records that result and stops there', async () => {
    const pending = [];
    const harness = preparedHarness((request) => new Promise((resolve) => pending.push({ request, resolve })));
    const run = harness.startEnrollment();
    await drainMicrotasks();
    harness.cancelRun();
    assert.equal(harness.state.busy, 'enroll', 'the panel stays locked until the sent request settles');
    pending[0].resolve(confirmEveryRequest(pending[0].request));
    await run;
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.offersByAccount.get('card-a')[1].status, 'ENROLLED');
    assert.match(harness.state.status, /Stopped.*1 offers added/);
});

test('HTTP 429 stops the run, saves the cooldown, and blocks an immediate restart', async () => {
    let requestCount = 0;
    const harness = preparedHarness((request) => (++requestCount === 2
        ? jsonResponse({}, 429, { 'Retry-After': '300' })
        : confirmEveryRequest(request)));
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2, 'no retry and no third offer');
    assert.equal(harness.state.cooldownUntil, harness.requests[1].startedAt + 300000);
    assert.equal(harness.userscriptStorage.get('amex-offer-lite:pacing').cooldownUntil, harness.state.cooldownUntil);
    assert.equal(harness.state.offersByAccount.get('card-a')[1].status, 'ENROLLED');
    assert.equal(harness.state.offersByAccount.get('card-a')[0].status, 'ELIGIBLE', 'a rate-limited offer is not marked unconfirmed');
    assert.match(harness.state.status, /HTTP 429.*1 offers added/);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2);
});

test('a network error marks only that card unconfirmed and stops before the next offer', async () => {
    let requestCount = 0;
    const harness = preparedHarness((request) => {
        if (++requestCount === 2) throw new Error('Synthetic network error');
        return confirmEveryRequest(request);
    });
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.offersByAccount.get('card-a')[0].status, 'UNCONFIRMED');
    assert.equal(harness.state.offersByAccount.get('card-b')[1].status, 'ELIGIBLE', 'the offer after the failure was never sent');
    assert.match(harness.state.status, /Synthetic network error.*1 offers added/);
    assert.equal(harness.state.pendingEnrollments.size, 0);
});

test('an unsaveable pending state stops the run before any request leaves', async () => {
    const harness = preparedHarness(confirmEveryRequest, { onSave(key) {
        if (key === 'card_offer_hub_amex_saved_offers_v1') throw new Error('Synthetic offer checkpoint failure');
    } });
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.status, /No enrollment request was sent.*0 offers added/);
    assert.equal(harness.state.pendingEnrollments.size, 0);
});
