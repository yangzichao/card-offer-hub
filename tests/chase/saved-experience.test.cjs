const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');
const { account, offer, endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');
const { activationListing, clickEndpoint, emptyAcknowledgement } = require('./fixtures/activation-response.cjs');
function setup(server = {}, options = {}) {
    server.activated ||= new Set();
    server.cards ||= [account(), account('202', 'Synthetic Card B')];
    const harness = createHarness((request, access) => {
        if (request.url.startsWith(clickEndpoint)) {
            const query = new URL(request.url).searchParams;
            const key = query.get('digital-account-identifier') + ':' + query.get('offer-identifier');
            if (server.unconfirmed !== key) server.activated.add(key);
            server.onClick?.(access);
            return emptyAcknowledgement();
        }
        const accountId = JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0];
        if (server.failCard === accountId) return jsonResponse({}, 500);
        const rows = [offer('new'), offer('seen', 'SERVED'), ...(server.extra ? [offer('extra')] : [])]
            .map(row => server.activated.has(accountId + ':' + row.offerIdentifier) ? { ...row, offerStatusName: 'ACTIVATED' } : row);
        const payload = activationListing(accountId, rows);
        payload.digitalProfileAccounts = server.cards;
        if (server.stopCard === accountId) access.stopRun();
        return jsonResponse(payload);
    }, options);
    function capture() {
        const context = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders());
        const payload = activationListing();
        payload.digitalProfileAccounts = server.cards;
        harness.captureSessionResponse(context, payload);
    }
    capture();
    return { harness, server, capture };
}
const writes = harness => harness.requests.filter(request => request.url.startsWith(clickEndpoint))
    .map(request => { const query = new URL(request.url).searchParams; return query.get('digital-account-identifier') + ':' + query.get('offer-identifier'); });
const reads = harness => harness.requests.filter(request => !request.url.startsWith(clickEndpoint))
    .map(request => JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0]);

test('Chase first load discovers and scans all cards without adding', async () => {
    const { harness } = setup();
    assert.equal(harness.requests.length, 0);
    await harness.refreshAllCardsAndOffers();
    assert.deepEqual(reads(harness), ['101', '202']);
    assert.equal(writes(harness).length, 0);
    assert.deepEqual(Array.from(harness.state.selected), ['101', '202']);
    assert.equal(harness.state.offers.length, 4);
    assert.equal(harness.state.needsScan, false);
});

test('Chase refresh scans deselected cards, preserves opt-outs, selects new cards and only adds selected scope', async () => {
    const { harness, server, capture } = setup();
    await harness.refreshAllCardsAndOffers();
    harness.setCardSelected('202', false);
    server.cards.push(account('303', 'Synthetic Card C'));
    capture();
    harness.requests.length = 0;
    harness.state.search = 'not visible';
    await harness.refreshAndAddOffers();
    assert.deepEqual(reads(harness).slice(0, 3), ['101', '202', '303']);
    assert.deepEqual(writes(harness), ['101:new', '101:seen', '303:new', '303:seen']);
    assert.deepEqual(Array.from(harness.state.selected), ['101', '303']);
});

test('Chase reopened saved offers recover current credentials and never add newly discovered offers', async () => {
    const original = setup();
    await original.harness.refreshAllCardsAndOffers();
    original.harness.setCardSelected('202', false);
    original.server.extra = true;
    const { harness } = setup(original.server, { storage: original.harness.storage });
    harness.restoreWorkspace();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.offerWorkflow.preview().length, 2);
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness), ['101:new', '101:seen']);
    assert.equal(harness.state.confirmed, 2);
    assert.ok(reads(harness).every(accountId => accountId === '101'));
    assert.ok(!harness.state.offers.some(row => row.offerId === 'extra'), 'verification must not expand the saved scope');
    assert.doesNotMatch(JSON.stringify([...harness.storage]), /synthetic-session|synthetic-impression|activationParameters/);
});

test('Chase saved continuation skips an uncertain click across later verification and reload', async () => {
    const first = setup({ unconfirmed: '101:new' });
    await first.harness.refreshAllCardsAndOffers();
    first.harness.setCardSelected('202', false);
    await first.harness.addSavedOffers();
    assert.deepEqual(writes(first.harness), ['101:new']);
    assert.equal(first.harness.state.offers.find(row => row.accountId === '101' && row.offerId === 'new').status, 'UNCONFIRMED');
    const { harness } = setup(first.server, { storage: first.harness.storage });
    harness.restoreWorkspace();
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness), ['101:seen']);
    assert.equal(harness.state.offers.find(row => row.accountId === '101' && row.offerId === 'new').status, 'UNCONFIRMED');
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness), ['101:seen']);
});

test('Chase stop during a click preserves progress and another explicit saved action only sends remaining offers', async () => {
    const { harness, server } = setup({ onClick: access => access.stopRun() });
    await harness.refreshAllCardsAndOffers();
    harness.setCardSelected('202', false);
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness), ['101:new']);
    assert.match(harness.state.status, /Stopped/);
    delete server.onClick;
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness), ['101:new', '101:seen']);
    assert.equal(harness.state.offers.find(row => row.accountId === '101' && row.offerId === 'new').status, 'ACTIVATED');
});

test('Chase failed or stopped refresh keeps the previous complete workspace and sends no clicks', async () => {
    for (const failure of ['failCard', 'stopCard']) {
        const { harness, server } = setup();
        await harness.refreshAllCardsAndOffers();
        const original = JSON.stringify({ accounts: harness.state.accounts, offers: harness.state.offers, selected: [...harness.state.selected], time: harness.state.lastScanAt });
        server.extra = true;
        server[failure] = '202';
        harness.requests.length = 0;
        await harness.refreshAndAddOffers();
        assert.deepEqual(reads(harness), ['101', '202']);
        assert.equal(writes(harness).length, 0);
        assert.equal(JSON.stringify({ accounts: harness.state.accounts, offers: harness.state.offers, selected: [...harness.state.selected], time: harness.state.lastScanAt }), original);
        delete server[failure];
        await harness.addSavedOffers();
        assert.deepEqual(writes(harness), ['101:new', '101:seen', '202:new', '202:seen']);
    }
});

test('Chase changed customer blocks saved addition without losing old results', async () => {
    const { harness } = setup();
    await harness.refreshAllCardsAndOffers();
    const original = JSON.stringify(harness.state.offers);
    const context = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders('101', '808'));
    harness.captureSessionResponse(context, { ...activationListing(), primaryIndividualEnterprisePartyIdentifier: '808' });
    harness.requests.length = 0;
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 0);
    assert.equal(JSON.stringify(harness.state.offers), original);
    assert.match(harness.state.status, /do not match this login/);
});
