const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createUserscriptHarness } = require('./helpers/userscript-harness.cjs');

const harPath = process.argv[2];
if (!harPath) throw new Error('Usage: node tests/amex/verify-har.cjs /path/to/capture.har');
const entries = JSON.parse(readFileSync(harPath, 'utf8')).log.entries;
const offersDocument = entries.find((entry) => new URL(entry.request.url).pathname === '/offers'
    && entry.response.content.mimeType?.includes('html') && entry.response.content.text);
assert.ok(offersDocument, 'HAR must contain the Offers page HTML');
const initialStateAssignment = offersDocument.response.content.text.match(/window\.__INITIAL_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
assert.ok(initialStateAssignment, 'Offers page must expose a data-only initial-state assignment');
const harness = createUserscriptHarness(undefined, { initialState: JSON.parse(initialStateAssignment[1]) });
const pageState = harness.readPageState();
const accounts = harness.accountsFromPage(pageState);
assert.ok(accounts.length > 0, 'Current page-state adapter must detect cards');
assert.equal(new Set(accounts.map((account) => account.token)).size, accounts.length);
const hub = pageState.modules['axp-loyalty-root'].dataHooks.cache.axpOffersHub.result;
const recommended = harness.offersInSection(hub, 'recommendedOffers');
const added = harness.offersInSection(hub, 'addedToCard');
const normalized = [...recommended, ...added].map(harness.normalizeHubOffer);
assert.ok(recommended.length > 0);
assert.ok(normalized.every((offer) => offer.id && offer.name && offer.groupKey));
assert.ok(added.every((offer) => harness.normalizeHubOffer(offer).status === 'ENROLLED'));
const enrollment = entries.find((entry) => new URL(entry.request.url).pathname === '/CreateOffersHubEnrollment.web.v1'
    && entry.request.method === 'POST' && entry.response.status === 200);
assert.ok(enrollment);
const body = JSON.parse(enrollment.request.postData.text);
const response = JSON.parse(enrollment.response.content.text);
assert.equal(response.status.purpose, 'SUCCESS');
assert.ok(harness.offersInSection(response, 'addedToCard').some((offer) => offer.offerId === body.offerId && offer.enrollmentDetails.status === 'ENROLLED'));
// The same capture also contains a successful original card enrollment request.
// Cross-check its actual body/response and the identifier shared with Hub reads.
const cardEnrollment = entries.find((entry) => new URL(entry.request.url).pathname === '/CreateCardAccountOfferEnrollment.v1'
    && entry.request.method === 'POST' && entry.response.status === 200);
assert.ok(cardEnrollment, 'HAR must contain the original card enrollment contract');
const cardEnrollmentBody = JSON.parse(cardEnrollment.request.postData.text);
const cardEnrollmentResponse = JSON.parse(cardEnrollment.response.content.text);
const expectedKeys = ['accountNumberProxy', 'identifier', 'locale', 'requestDateTimeWithOffset', 'userOffset'];
assert.deepEqual(Object.keys(cardEnrollmentBody).sort(), expectedKeys.sort());
assert.equal(cardEnrollmentResponse.isEnrolled, true);
assert.equal(harness.cardEnrollmentStatus(cardEnrollmentResponse, cardEnrollmentBody.accountNumberProxy, cardEnrollmentBody.identifier), 'ENROLLED');
const generatedBody = harness.cardEnrollmentBody('synthetic-card', 'synthetic-offer');
assert.deepEqual(Object.keys(generatedBody).sort(), expectedKeys.sort());
assert.equal(generatedBody.locale, cardEnrollmentBody.locale);
assert.match(generatedBody.userOffset, /^[+-]\d{2}:\d{2}$/);
assert.ok(Number.isFinite(Date.parse(generatedBody.requestDateTimeWithOffset)));
assert.equal(body.accountNumberProxy, cardEnrollmentBody.accountNumberProxy);
assert.ok(harness.offersInSection(response, 'addedToCard').some((offer) => offer.offerId === cardEnrollmentBody.identifier
    && offer.enrollmentDetails.status === 'ENROLLED'), 'a confirmed legacy identifier must match the enrolled Hub offer');
const headerNames = cardEnrollment.request.headers.map((header) => header.name.toLowerCase());
assert.ok(headerNames.includes('one-data-correlation-id'));
assert.ok(headerNames.includes('ce-source'));
assert.ok(!headerNames.includes('authorization'), 'the captured successful request does not need a Bearer token');
assert.equal(harness.requests.length, 0);
const frontend = entries.find((entry) => entry.request.url.includes('/axp-offers-hub/')
    && entry.request.url.split('?')[0].endsWith('.js'))?.response.content.text;
assert.ok(frontend?.includes('function useAddedToCardViewAll()'), 'Captured frontend must define the full added view');
assert.match(frontend, /function useAddedToCardViewAll\(\)\{.{0,120}e\.addedToCardViewAll/,
    'The official full-view selector must use addedToCardViewAll, not the addedToCard preview');
// Counts and schema outcomes only. Never print cards, offer IDs, headers, or captured bodies.
console.log(JSON.stringify({ result: 'PASS', detectedCards: accounts.length, recommendedOffers: recommended.length,
    addedOffers: added.length, informationalOffers: normalized.filter((offer) => !offer.enrollable).length,
    fullAddedViewSelector: 'addedToCardViewAll', enrollmentContract: 'legacy isEnrolled=true confirmed',
    legacyIdentifierMatchesHub: true, requestsSent: 0 }));
