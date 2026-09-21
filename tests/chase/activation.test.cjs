const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, selectCards } = require('./helpers/userscript-harness.cjs');
const { offer, endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');
const { activationListing, clickEndpoint, emptyAcknowledgement } = require('./fixtures/activation-response.cjs');

function scenario(options = {}) {
    const activated = new Set();
    const revisions = new Map();
    const harness = createHarness((request, access) => {
        if (request.url.startsWith(clickEndpoint)) {
            const query = new URL(request.url).searchParams;
            const accountId = query.get('digital-account-identifier');
            assert.equal(query.get('offer-session-token-identifier'), `synthetic-session-${accountId}-${revisions.get(accountId) || 0}`);
            options.onClick?.(access, query);
            if (options.clickResponse) return options.clickResponse();
            if (!options.unconfirmed) activated.add(`${query.get('digital-account-identifier')}:${query.get('offer-identifier')}`);
            return emptyAcknowledgement();
        }
        const accountId = JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0];
        const revision = (revisions.get(accountId) || 0) + Number(activated.size > 0);
        revisions.set(accountId, revision);
        const rows = [offer('new'), offer('seen', 'SERVED'), offer('already', 'ACTIVATED')]
            .map(row => activated.has(`${accountId}:${row.offerIdentifier}`) ? { ...row, offerStatusName: 'ACTIVATED' } : row);
        const payload = activationListing(accountId, rows, String(revision));
        options.onRead?.(payload, access, activated.size);
        return jsonResponse(payload);
    }, options.harnessOptions);
    return harness;
}
const clicks = harness => harness.requests.filter(request => request.url.startsWith(clickEndpoint));

test('Chase adds NEW and SERVED per selected card and confirms each exact offer through a fresh read', async () => {
    const harness = scenario();
    await harness.detectCards();
    await harness.scanOffers();
    harness.state.search = 'no visible matches';
    await harness.addAllOffers();
    assert.equal(clicks(harness).length, 4);
    assert.equal(harness.state.confirmed, 4);
    assert.equal(harness.maximumActive(), 1);
    assert.ok(harness.state.offers.every(row => row.status === 'ACTIVATED'));
    assert.equal(harness.state.needsScan, false);
    for (const request of clicks(harness)) {
        assert.equal(request.method, 'GET');
        assert.equal(request.credentials, 'omit');
        assert.equal(request.mode, 'cors');
        assert.equal(request.redirect, 'error');
        assert.deepEqual(Object.keys(request.headers), ['Accept']);
        assert.equal(new URL(request.url).searchParams.get('recommendation-event-type-code'), 'CLICK');
    }
    for (let index = 1; index < harness.requests.length; index++) {
        assert.ok(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt >= 500);
    }
    const saved = JSON.stringify([...harness.storage]);
    assert.doesNotMatch(saved, /synthetic-session|synthetic-impression|activationParameters|reco\.chase/);
});

test('Chase acknowledgement alone leaves a durable unconfirmed record and does not retry', async () => {
    const harness = scenario({ unconfirmed: true });
    selectCards(harness);
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(clicks(harness).length, 1);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
    assert.match(harness.state.status, /did not confirm/);
    await harness.addAllOffers();
    assert.equal(clicks(harness).length, 1);
    const restored = createHarness(() => assert.fail('reload must not fetch'), { storage: harness.storage });
    restored.restoreWorkspace();
    assert.equal(restored.state.offers[0].status, 'UNCONFIRMED');
    await restored.addAllOffers();
    assert.equal(restored.requests.length, 0);
});

test('Chase rejects missing, conflicting or foreign click details before sending any activation', async () => {
    for (const mutate of [
        raw => { delete raw.digitalInteractionDestUrlText; },
        raw => { raw.digitalInteractionDestUrlText = raw.digitalInteractionDestUrlText.replace('909', '808'); },
        raw => { raw.digitalInteractionDestUrlText += '&offer-identifier=other'; },
        raw => { raw.digitalInteractionDestUrlText = 'https://example.com/?token=synthetic'; },
        raw => { raw.offerImpressionTokenIdentifier = 'different'; },
        raw => { raw.digitalInteractionDestUrlText = raw.digitalInteractionDestUrlText.replace('CLICK', 'VIEW'); },
        raw => { raw.digitalInteractionDestUrlText += '&extra=unknown'; }
    ]) {
        const harness = scenario({ onRead(payload) { payload.customerOffers[0].offers.forEach(mutate); } });
        selectCards(harness);
        await harness.scanOffers();
        await harness.addAllOffers();
        assert.equal(clicks(harness).length, 0);
        assert.match(harness.state.status, /click details/);
    }
});

test('Chase inconsistent metadata is excluded without blocking supported offers', async () => {
    const harness = scenario({ onRead(payload) { payload.customerOffers[0].offers[1].offerImpressionTokenIdentifier = 'mismatch'; } });
    selectCards(harness);
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(clicks(harness).length, 1);
    assert.equal(harness.state.confirmed, 1);
    assert.match(harness.state.status, /1 offers lack verified click details/);
    assert.equal(harness.state.offers.find(row => row.offerId === 'seen').status, 'SERVED');
});

test('Chase stops on click HTTP errors, rate limits, network failure and malformed responses', async () => {
    for (const clickResponse of [
        () => emptyAcknowledgement(429, '600'), () => emptyAcknowledgement(401), () => emptyAcknowledgement(500),
        () => emptyAcknowledgement(204),
        () => ({ ...emptyAcknowledgement(), text: async () => '<html>Login</html>' }),
        () => { throw new TypeError('private URL must not reach UI'); }
    ]) {
        const harness = scenario({ clickResponse });
        selectCards(harness);
        await harness.scanOffers();
        await harness.addAllOffers();
        assert.equal(harness.requests.length, 2);
        assert.equal(clicks(harness).length, 1);
        assert.equal(harness.state.needsScan, true);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
        assert.doesNotMatch(harness.state.status, /private URL/);
        if (harness.state.status.includes('429')) assert.ok(harness.state.cooldownUntil > 0);
    }
});

test('Chase persists uncertainty before the click and a stop never emits another request', async () => {
    const harness = scenario({ onClick(access) {
        const saved = harness.storage.get('chase-offer-lite:workspace');
        assert.equal(saved.offers[0].status, 'UNCONFIRMED');
        access.stopRun();
    } });
    selectCards(harness);
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.confirmed, 0);
    assert.match(harness.state.status, /Stopped/);
});

test('Chase storage failure before click blocks the write', async () => {
    let failPending = false;
    const harness = scenario({ harnessOptions: { onSave(key, value) {
        if (failPending && key.endsWith(':workspace') && value.offers.some(row => row.status === 'UNCONFIRMED')) throw new Error('disk failure');
    } } });
    selectCards(harness);
    await harness.scanOffers();
    failPending = true;
    await harness.addAllOffers();
    assert.equal(clicks(harness).length, 0);
    assert.match(harness.state.storageError, /Cannot save/);
});

test('Chase session change during click prevents verification and subsequent clicks', async () => {
    const harness = scenario({ onClick(access) {
        const context = access.captureSessionRequest(endpoint, 'GET', sessionHeaders('101', '808'));
        access.captureSessionResponse(context, { ...activationListing(), primaryIndividualEnterprisePartyIdentifier: '808' });
    } });
    selectCards(harness);
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.confirmed, 0);
    assert.match(harness.state.status, /session changed/);
});

test('Chase partial or wrong-card verification cannot confirm a click', async () => {
    for (const mutate of [
        payload => { payload.customerOffers[0].partial = true; },
        payload => { payload.customerOffers[0].digitalAccountIdentifier = 202; },
        payload => { payload.customerOffers[0].offers[0].offerIdentifier = 'different-offer'; }
    ]) {
        const harness = scenario({ onRead(payload, access, activated) { if (activated) mutate(payload); } });
        selectCards(harness);
        await harness.scanOffers();
        await harness.addAllOffers();
        assert.equal(clicks(harness).length, 1);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
    }
});
