const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');
const { listing, endpoint, legacyEndpoint, sessionHeaders, dashboardEndpoint, dashboardHeaders } = require('./fixtures/offers-response.cjs');

function pathOf(url) {
    return new URL(url, 'https://secure.chase.com').pathname;
}

test('Chase observes the current /svc/gw/mkt homepage preview and the legacy gateway', () => {
    for (const [url, headers] of [
        [dashboardEndpoint, dashboardHeaders()],
        [dashboardEndpoint.replace(endpoint, legacyEndpoint), dashboardHeaders()],
        [endpoint, sessionHeaders()],
        [legacyEndpoint, sessionHeaders()]
    ]) {
        const harness = createHarness(undefined, { seedSession: false });
        const capture = harness.captureSessionRequest(url, 'GET', headers);
        assert.notEqual(capture, null, url);
        assert.equal(harness.captureSessionResponse(capture, listing()), true, url);
        assert.equal(harness.currentSession().offersPath, pathOf(url));
    }
});

test('Chase rejects unknown gateway prefixes for the same resource', () => {
    const harness = createHarness(undefined, { seedSession: false });
    for (const url of [
        endpoint.replace('/svc/gw/mkt/', '/svc/gw/other/'),
        endpoint.replace('/svc/gw/mkt/secure/gateway', ''),
        `${endpoint}/extra`
    ]) assert.equal(harness.captureSessionRequest(url, 'GET', sessionHeaders()), null, url);
});

test('Chase script reads follow the gateway prefix the page last used', async () => {
    for (const nativeEndpoint of [endpoint, legacyEndpoint]) {
        const harness = createHarness(request => jsonResponse(listing(JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0])),
            { seedSession: false });
        const capture = harness.captureSessionRequest(nativeEndpoint, 'GET', sessionHeaders());
        assert.equal(harness.captureSessionResponse(capture, listing()), true);
        await harness.refreshAllCardsAndOffers();
        assert.equal(harness.requests.length, 2);
        assert.deepEqual(Array.from(harness.requests, request => pathOf(request.url)), [pathOf(nativeEndpoint), pathOf(nativeEndpoint)]);
        const query = new URL(harness.requests[0].url, 'https://secure.chase.com').searchParams;
        assert.equal(query.get('source-request-component-name'), 'OFFERS_HUB_ALL');
        assert.equal(harness.state.needsScan, false);
    }
});
