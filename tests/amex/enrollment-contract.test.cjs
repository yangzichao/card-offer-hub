const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer } = require('./fixtures/synthetic-offers.cjs');

test('card enrollment uses the original endpoint, identifier, timestamp and user offset without a Hub write', async () => {
    const harness = createUserscriptHarness(() => jsonResponse({ isEnrolled: true }));
    configureAccounts(harness);
    assert.equal(await harness.enrollOffer('card-a', 'shared-offer'), 'ENROLLED');
    assert.equal(harness.requests.length, 1, 'never submit to both enrollment endpoints');
    const request = harness.requests[0];
    assert.equal(request.url, 'https://functions.americanexpress.com/CreateCardAccountOfferEnrollment.v1');
    assert.deepEqual(Object.keys(request.body).sort(), ['accountNumberProxy', 'identifier', 'locale', 'requestDateTimeWithOffset', 'userOffset'].sort());
    assert.equal(request.body.accountNumberProxy, 'card-a');
    assert.equal(request.body.identifier, 'shared-offer');
    assert.equal(request.body.locale, 'en-US');
    assert.equal(request.body.requestDateTimeWithOffset, new Date(request.startedAt).toISOString());
    assert.match(request.body.userOffset, /^[+-]\d\d:\d\d$/);
    assert.equal(request.options.credentials, 'include');
    assert.equal(request.options.headers['ce-source'], 'WEB');
    assert.match(request.options.headers['one-data-correlation-id'], /^[0-9a-f-]{36}$/);
    assert.equal(request.options.headers.Authorization, undefined, 'the captured working request uses cookies, not a guessed token');
});

for (const [timezoneOffsetMinutes, expected] of [[-480, '+08:00'], [0, '+00:00'], [420, '-07:00'], [-345, '+05:45'], [210, '-03:30']]) {
    test(`legacy enrollment timezone offset ${timezoneOffsetMinutes} maps to ${expected}`, () => {
        const harness = createUserscriptHarness();
        assert.equal(harness.enrollmentUserOffset({ getTimezoneOffset: () => timezoneOffsetMinutes }), expected);
    });
}

async function drainMicrotasks() {
    for (let index = 0; index < 30; index++) await Promise.resolve();
}

async function drainUntil(condition) {
    for (let index = 0; index < 20 && !condition(); index++) await drainMicrotasks();
}

test('enrollment requests reach the legacy endpoint one at a time, and a rejected card never turns green', async () => {
    const pending = [];
    const harness = createUserscriptHarness((request) => new Promise((resolve) => pending.push({ request, resolve })));
    configureAccounts(harness, ['card-a', 'card-b', 'card-c']);
    for (const account of harness.state.accounts) {
        // Each offer exists on exactly one card, so every card is its own target.
        harness.state.offersByAccount.set(account.token, [harness.normalizeHubOffer(
            rawOffer(`${account.token}-offer`, 'NOT_ENROLLED', { title: `Only on ${account.token}` }))]);
        harness.state.scanReports.set(account.token, 'Complete');
    }
    assert.deepEqual(Array.from(harness.enrollmentPlan(), ({ account }) => account.token), ['card-a', 'card-b', 'card-c']);
    const enrollment = harness.startEnrollment();
    await drainMicrotasks();
    assert.equal(pending.length, 1, 'no second request starts before the first response');
    assert.equal(harness.maximumActiveRequests(), 1);
    harness.advanceTime(4000);
    const firstResponseAt = pending[0].request.startedAt + 4000;
    pending[0].resolve(jsonResponse({ isEnrolled: true }));
    await drainUntil(() => pending.length >= 2);
    // Model the user's actual symptom: a rejection must never be reported as added.
    pending[1].resolve(jsonResponse({ isEnrolled: false }));
    await enrollment;
    assert.equal(pending.length, 2, 'a rejected enrollment stops the run with no retry and no third request');
    assert.ok(pending.every(({ request }) => request.url.endsWith('/CreateCardAccountOfferEnrollment.v1')));
    assert.equal(new Set(pending.map(({ request }) => request.options.headers['one-data-correlation-id'])).size, 2);
    assert.equal(pending[1].request.startedAt - firstResponseAt, 500, 'the gap is measured from the previous response');
    assert.equal(harness.state.offersByAccount.get('card-a')[0].status, 'ENROLLED');
    assert.equal(harness.state.offersByAccount.get('card-b')[0].status, 'FAILED');
    assert.equal(harness.state.offersByAccount.get('card-c')[0].status, 'ELIGIBLE');
    assert.match(harness.state.status, /1 offers added/);
    assert.ok(harness.state.logs.some((message) => message.includes('3 offers one at a time')));
    assert.equal(harness.state.logs.filter((message) => message.includes('isEnrolled=false')).length, 1);
});
