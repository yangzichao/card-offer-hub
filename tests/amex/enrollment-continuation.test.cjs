const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer, confirmation } = require('./fixtures/synthetic-offers.cjs');

const answers = {
    added: (request) => jsonResponse(confirmation(request.body.identifier)),
    onOtherCard: () => jsonResponse({ isEnrolled: false, explanationCode: 'PZN4107', explanationMessage: 'Card member Already added the offer on another card' }),
    declined: () => jsonResponse({ isEnrolled: false }),
    unconfirmed: () => jsonResponse({}),
    serverError: () => jsonResponse({}, 500)
};

// Offer identifiers are `${title}-${card}`, so each synthetic answer is chosen by title.
function respondByTitle(answerByTitle) {
    return (request) => answers[answerByTitle[request.body.identifier.replace(/-card-[a-z]$/, '')]](request);
}

function preparedHarness(offerTitlesByCard, fetchResponse) {
    const harness = createUserscriptHarness(fetchResponse);
    configureAccounts(harness, Object.keys(offerTitlesByCard));
    for (const [accountToken, titles] of Object.entries(offerTitlesByCard)) {
        harness.state.offersByAccount.set(accountToken, titles.map((title) =>
            harness.normalizeHubOffer(rawOffer(`${title}-${accountToken}`, 'NOT_ENROLLED', { title }))));
        harness.state.scanReports.set(accountToken, 'Complete');
    }
    return harness;
}

function statusesOn(harness, accountToken) {
    return Array.from(harness.state.offersByAccount.get(accountToken), (offer) => offer.status);
}

test('every explicit per-offer answer is recorded and the run moves on to the next offer', async () => {
    const harness = preparedHarness({ 'card-a': ['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4'] },
        respondByTitle({ 'Offer 1': 'onOtherCard', 'Offer 2': 'declined', 'Offer 3': 'unconfirmed', 'Offer 4': 'added' }));
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 4);
    assert.equal(harness.maximumActiveRequests(), 1);
    assert.deepEqual(statusesOn(harness, 'card-a'), ['ON_OTHER_CARD', 'FAILED', 'UNCONFIRMED', 'ENROLLED']);
    assert.equal(harness.state.enrollmentProgress.completed, 4, 'progress counts every processed offer, not only additions');
    assert.equal(harness.state.status, 'Enrollment complete. 1 offers added · 1 already on another card · 1 declined by Amex · 1 unconfirmed; scan to check them.');
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 4, 'a second click retries nothing');
});

test('on another card settles the offer; a declined offer goes to the next card only on a later click', async () => {
    const harness = preparedHarness({ 'card-a': ['Shared', 'Declined'], 'card-b': ['Shared', 'Declined'] },
        respondByTitle({ Shared: 'onOtherCard', Declined: 'declined' }));
    await harness.startEnrollment();
    assert.deepEqual(Array.from(harness.requests, (request) => request.body.identifier), ['Declined-card-a', 'Shared-card-a'],
        'one card per offer within a run');
    assert.deepEqual(Array.from(harness.enrollmentPlan(), ({ account, offer }) => `${offer.name}@${account.token}`), ['Declined@card-b']);
});

test('three unconfirmed answers in a row pause the run and leave the rest untouched', async () => {
    const harness = preparedHarness({ 'card-a': ['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4'] }, answers.unconfirmed);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 3);
    assert.deepEqual(statusesOn(harness, 'card-a'), ['UNCONFIRMED', 'UNCONFIRMED', 'UNCONFIRMED', 'ELIGIBLE']);
    assert.match(harness.state.status, /^Paused: Amex did not confirm 3 offers in a row; 1 offers were not attempted\. .*0 offers added · 3 unconfirmed; scan to check them\.$/);
    assert.equal(harness.state.busy, null);
    assert.deepEqual(Array.from(harness.enrollmentPlan(), ({ offer }) => offer.name), ['Offer 4'], 'the untouched offer can still be added later');
});

test('an explicit answer resets the unconfirmed streak, and a queue ending on its third unconfirmed answer completes', async () => {
    const harness = preparedHarness({ 'card-a': ['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4', 'Offer 5', 'Offer 6'] },
        respondByTitle({ 'Offer 1': 'unconfirmed', 'Offer 2': 'unconfirmed', 'Offer 3': 'declined',
            'Offer 4': 'unconfirmed', 'Offer 5': 'unconfirmed', 'Offer 6': 'unconfirmed' }));
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 6);
    assert.equal(harness.state.status, 'Enrollment complete. 0 offers added · 1 declined by Amex · 5 unconfirmed; scan to check them.');
});

test('HTTP errors still end the run: that offer is unconfirmed and nothing after it is sent', async () => {
    const harness = preparedHarness({ 'card-a': ['Offer 1', 'Offer 2', 'Offer 3'] },
        respondByTitle({ 'Offer 1': 'added', 'Offer 2': 'serverError', 'Offer 3': 'added' }));
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2);
    assert.deepEqual(statusesOn(harness, 'card-a'), ['ENROLLED', 'UNCONFIRMED', 'ELIGIBLE']);
    assert.equal(harness.state.status, 'HTTP 500. No automatic retry was made. 1 offers added.');
});
