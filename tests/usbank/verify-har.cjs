// Read-only local contract check. Never emits captured identifiers or payloads.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHarness } = require('./helpers/userscript-harness.cjs');

function verifyCapture(filePath) {
    const entries = JSON.parse(readFileSync(filePath, 'utf8')).log.entries;
    const harness = createHarness();
    const script = readFileSync(resolve(__dirname, '../../dist/usbank-offer-lite.user.js'), 'utf8');
    const snapshots = [];
    let activationCount = 0;
    const decode = content => JSON.parse(content.encoding === 'base64'
        ? Buffer.from(content.text, 'base64').toString('utf8') : content.text);
    for (const entry of entries) {
        if (entry.request.url !== 'https://onlinebanking.usbank.com/digital/api/customer-management/graphql/v2') continue;
        const request = JSON.parse(entry.request.postData.text);
        const payload = decode(entry.response.content);
        if (request.query.includes('getCashbackOffersAds')) {
            const normalized = harness.normalizeListing(payload);
            snapshots.push(normalized);
            for (const value of Object.values(request.variables.request)) {
                if (typeof value === 'string' && value.length > 12) assert.equal(script.includes(value), false, 'Captured session value must not appear in the bundle');
            }
        }
        for (const event of request.variables?.request?.clientEvents || []) {
            if (event.clientEvent !== 'ActivateOffer') continue;
            assert.equal(event.clientEventType, 'AdInteraction');
            assert.equal(event.clientEventMetadata.section, 'Summary');
            assert.equal(event.clientEventMetadata.channel, 'OLB');
            assert.equal(event.curationId, 'Featured');
            assert.equal(harness.activationAcknowledged(payload), true);
            const matching = snapshots.some(snapshot => snapshot.requestId === event.clientEventId
                && snapshot.sessionTokenId === request.variables.request.sessionTokenId
                && snapshot.offers.some(offer => offer.offerId === event.clientOfferId && offer.serveToken === event.clientEventMetadata.serveToken));
            assert.equal(matching, true, 'Activation context must match a captured listing');
            activationCount++;
        }
    }
    assert.ok(snapshots.length > 0 && activationCount > 0, 'Capture must include listing and activation traffic');
    console.log(`US Bank local HAR contract passed: ${snapshots.length} listing(s), ${snapshots.reduce((count, snapshot) => count + snapshot.offers.length, 0)} offers, ${activationCount} activation acknowledgement(s).`);
    console.log('Acknowledgements do not prove activated state. No network requests were made; live read-back remains unverified.');
}
try {
    if (!process.argv[2]) throw new Error();
    verifyCapture(process.argv[2]);
} catch {
    // Assertions/parser errors can embed payload values. Keep failures generic.
    console.error('US Bank HAR verification failed: missing file, unsupported structure, or contract mismatch. No captured data was printed.');
    process.exitCode = 1;
}
