const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, successfulResponder, isActivation } = require('./helpers/userscript-harness.cjs');

test('explicit Add all uses every scanned available offer, independent of search and checkbox selection', async () => {
    const harness = createHarness(successfulResponder(['a', 'b']));
    await harness.scanOffers();
    harness.setOfferSelected('a', true);
    harness.state.search = 'Example a';
    await harness.addAllOffers();
    assert.deepEqual(harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId), ['a', 'b']);
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.state.total, 2);
    assert.equal(harness.maximumActive(), 1);
});
test('Add selected stays a separate, narrower action', async () => {
    const harness = createHarness(successfulResponder(['a', 'b']));
    await harness.scanOffers();
    harness.setOfferSelected('a', true);
    await harness.activateSelectedOffers();
    assert.deepEqual(harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId), ['a']);
});
