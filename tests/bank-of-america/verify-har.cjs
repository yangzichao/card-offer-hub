// Local structure validation only. Never sends requests or prints captured values.
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { createHarness, responder } = require('./helpers/userscript-harness.cjs');
const harness = createHarness(responder());
const entries = JSON.parse(readFileSync(process.argv[2], 'utf8')).log.entries;
const counters = { lists: 0, offers: 0, details: 0, ordinaryActivations: 0, shoppingLinkActivations: 0, supportedSessions: 0 };
for (const entry of entries) {
    const url = new URL(entry.request.url);
    if (url.origin !== 'https://deals.merchant-rewards.com' || entry.response.status !== 200) continue;
    const content = entry.response.content;
    if (!content?.text || !/json/.test(content.mimeType)) continue;
    const payload = JSON.parse(content.encoding === 'base64' ? Buffer.from(content.text, 'base64').toString() : content.text);
    if (url.pathname === '/api/offers-page') {
        counters.lists++;
        for (const section of payload.sections) for (const raw of section.offers) { harness.normalizeOffer(raw); counters.offers++; }
    }
    if (url.pathname === '/api/offers-details') { harness.normalizeOffer(payload.offer); counters.details++; }
    if (/^\/api\/activate-offer\/\d+$/.test(url.pathname)) {
        assert.equal(payload.ok, true);
        if (entry.request.postData?.text) {
            assert.equal(JSON.parse(entry.request.postData.text).activation_source, 'OUTBOUND_LINK_CLICK');
            counters.shoppingLinkActivations++;
        } else counters.ordinaryActivations++;
    }
    const header = entry.request.headers.find(item => item.name.toLowerCase() === 'x-cardholder-token');
    if (header) {
        const claims = JSON.parse(Buffer.from(header.value.split('.')[1], 'base64url').toString());
        assert.equal(claims.featureFlags?.dxlEnabled, true);
        counters.supportedSessions++;
    }
}
assert.ok(counters.lists && counters.details && counters.ordinaryActivations);
console.log('HAR structure validation passed (counts only):', counters);
