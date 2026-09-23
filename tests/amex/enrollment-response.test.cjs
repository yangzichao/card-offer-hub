const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { confirmation, hubResponse, rawOffer } = require('./fixtures/synthetic-offers.cjs');

for (const [description, response, expected] of [
    ['observed legacy response with only isEnrolled', { isEnrolled: true }, 'ENROLLED'],
    ['matching optional identifier', confirmation('offer-a'), 'ENROLLED'],
    ['another offer confirmation', confirmation('offer-b'), 'UNCONFIRMED'],
    ['explicit rejection', { status: { purpose: 'ERROR' } }, 'FAILED'],
    ['missing confirmation', {}, 'UNCONFIRMED'],
    ['explicit false (old script incorrectly accepted this)', { isEnrolled: false }, 'FAILED'],
    ['PZN4107: Amex says the offer is already on another card', { isEnrolled: false, explanationCode: 'PZN4107',
        explanationMessage: 'Card member Already added the offer on another card' }, 'ON_OTHER_CARD'],
    ['any other explanation code stays a rejection', { isEnrolled: false, explanationCode: 'PZN2001' }, 'FAILED'],
    ['PZN4107 without an explicit false is not trusted', { explanationCode: 'PZN4107' }, 'UNCONFIRMED'],
    ['PZN4107 for another offer is not trusted', { isEnrolled: false, explanationCode: 'PZN4107', identifier: 'offer-b' }, 'UNCONFIRMED'],
    ['string true is not confirmation', { isEnrolled: 'true' }, 'UNCONFIRMED'],
    ['numeric true is not confirmation', { isEnrolled: 1 }, 'UNCONFIRMED'],
    ['conflicting success flag and error purpose', { isEnrolled: true, status: { purpose: 'ERROR' } }, 'FAILED'],
    ['null response', null, 'UNCONFIRMED'],
    ['wrong account confirmation', confirmation('offer-a', { accountNumberProxy: 'card-b' }), 'UNCONFIRMED'],
    ['Hub response is not the legacy confirmation contract', hubResponse('addedToCard', [rawOffer('offer-a', 'ENROLLED')]), 'UNCONFIRMED']
]) {
    test(`enrollment handles ${description}`, async () => {
        const harness = createUserscriptHarness(() => jsonResponse(response));
        configureAccounts(harness);
        assert.equal(await harness.enrollOffer('card-a', 'offer-a'), expected);
        assert.equal(harness.requests.length, 1);
        assert.match(harness.requests[0].url, /CreateCardAccountOfferEnrollment.v1$/);
        assert.equal(harness.requests[0].body.identifier, 'offer-a');
        assert.equal('offerUnencrypted' in harness.requests[0].body, false);
    });
}

test('HTTP 200 with invalid JSON is never success and is not retried', async () => {
    const harness = createUserscriptHarness(() => ({ ...jsonResponse({}), json: async () => { throw new SyntaxError(); } }));
    configureAccounts(harness);
    await assert.rejects(harness.enrollOffer('card-a', 'offer-a'), /not valid JSON/);
    assert.equal(harness.requests.length, 1);
});

test('failed HTTP requests are never reported as enrollment success', async () => {
    const harness = createUserscriptHarness(() => jsonResponse(confirmation('offer-a'), 403));
    configureAccounts(harness);
    await assert.rejects(harness.enrollOffer('card-a', 'offer-a'), /HTTP 403/);
});

test('the log records a short explanation code but never free server text', async () => {
    for (const [explanationCode, expectedLog] of [['PZN4107', 'isEnrolled=false, PZN4107'], ['free text from the server', 'isEnrolled=false)']]) {
        const harness = createUserscriptHarness(() => jsonResponse({ isEnrolled: false, explanationCode }));
        configureAccounts(harness);
        await harness.enrollOffer('card-a', 'offer-a');
        assert.ok(harness.state.logs.some((message) => message.includes(expectedLog)), expectedLog);
        assert.equal(harness.state.logs.some((message) => message.includes('free text')), false);
    }
});
