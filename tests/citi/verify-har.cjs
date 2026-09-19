// Read local captures without copying, replaying, or printing private values.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHarness } = require('./helpers/userscript-harness.cjs');
const capturePath = process.argv[2];
if (!capturePath) throw new Error('Usage: node tests/citi/verify-har.cjs /absolute/path/to/capture.har');
const entries = JSON.parse(readFileSync(capturePath, 'utf8')).log.entries;
const harness = createHarness();
let retrievals = 0;
let enrollments = 0;
let maximumCards = 0;
const uniqueOfferCounts = [];
const enrolledCards = new Set();
const enrolledOffers = new Set();
const enrollmentStatuses = new Set();
for (const entry of entries) {
    const url = new URL(entry.request.url);
    if (url.origin !== 'https://online.citi.com') continue;
    const path = url.pathname;
    if (![harness.SETTINGS.apiBase + harness.SETTINGS.retrievePath, harness.SETTINGS.apiBase + harness.SETTINGS.enrollmentPath].includes(path)) continue;
    if (entry.response.status !== 200) continue;
    const bodyText = entry.response.content.encoding === 'base64'
        ? Buffer.from(entry.response.content.text, 'base64').toString('utf8') : entry.response.content.text;
    const payload = JSON.parse(bodyText);
    const body = JSON.parse(entry.request.postData.text);
    assert.equal(entry.request.method, 'POST');
    if (path.endsWith('/retrieve')) {
        assert.ok(Object.keys(body).every(key => key === 'accountId'), 'New retrieval parameters require review');
        maximumCards = Math.max(maximumCards, harness.normalizeAccounts(payload).length);
        uniqueOfferCounts.push(harness.normalizeOffers(payload, 'synthetic-card').length);
        retrievals++;
    } else {
        assert.ok(typeof body.accountId === 'string' && body.accountId.length > 0, 'Missing enrollment account ID');
        assert.ok(typeof body.offerId === 'string' && body.offerId.length > 0, 'Missing enrollment offer ID');
        const expectedBody = harness.enrollmentBody(body);
        assert.ok(Object.keys(body).length === Object.keys(expectedBody).length
            && Object.entries(expectedBody).every(([key, value]) => body[key] === value),
        'Captured request differs from the generated enrollment body');
        assert.equal(harness.enrollmentConfirmed(payload, body), true, 'Captured enrollment response needs contract review');
        enrolledCards.add(body.accountId);
        enrolledOffers.add(body.offerId);
        enrollmentStatuses.add(payload.MerchantOfferDetails.offerStatus);
        enrollments++;
    }
}
assert.ok(retrievals > 0, 'No successful Merchant Offers retrieval found');
console.log(JSON.stringify({ retrievals, maximumCards, uniqueOfferCounts, confirmedEnrollmentSamples: enrollments,
    enrolledCardCount: enrolledCards.size, distinctEnrolledOfferCount: enrolledOffers.size,
    allObservedEnrollmentStatusesConfirmed: enrollments > 0 && [...enrollmentStatuses].every(status => status === 'ENROLLED'),
    boundary: enrollments ? 'Local HAR contract validation only; no live requests sent.' : 'Enrollment is source-derived, not verified against a captured write response.' }, null, 2));
