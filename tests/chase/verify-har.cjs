// Read the external capture in memory; never replay traffic or print private values.
const { readFileSync } = require('node:fs');
const { createHarness } = require('./helpers/userscript-harness.cjs');
const { inspectClickEvidence } = require('./helpers/har-click-evidence.cjs');
const expectedPath = '/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers';
const capturePath = process.argv[2];
if (!capturePath) {
    console.error('Usage: node tests/chase/verify-har.cjs /absolute/path/to/capture.har');
    process.exitCode = 1;
} else {
    try {
        const entries = JSON.parse(readFileSync(capturePath, 'utf8')).log.entries;
        const harness = createHarness(undefined, { seedSession: false });
        const summary = { successfulReads: 0, completeLists: 0, dashboardPreviews: 0, categorySubsets: 0, partialLists: 0,
            maximumDiscoveredCards: 0, observedNonGetRequests: 0 };
        for (const entry of entries) {
            const url = new URL(entry.request.url);
            if (url.origin !== 'https://secure.chase.com' || url.pathname !== expectedPath) continue;
            if (entry.request.method !== 'GET') { summary.observedNonGetRequests++; continue; }
            if (entry.response.status < 200 || entry.response.status >= 300) continue;
            const content = entry.response.content;
            const payload = JSON.parse(content.encoding === 'base64'
                ? Buffer.from(content.text, 'base64').toString('utf8') : content.text);
            const headers = Object.fromEntries(entry.request.headers.map(header => [header.name, header.value]));
            const context = harness.captureSessionRequest(entry.request.url, 'GET', headers);
            if (!context || !harness.captureSessionResponse(context, payload)) throw new Error('Session contract was rejected.');
            summary.maximumDiscoveredCards = Math.max(summary.maximumDiscoveredCards, harness.normalizeAccounts(payload).length);
            summary.successfulReads++;
            const dashboardPreview = url.searchParams.get('source-request-component-name') === 'OVERVIEW_DASHBOARD';
            const categorySubset = url.searchParams.has('offerCategoryCodeList');
            const partial = payload.customerOffers.some(account => account.partial !== false);
            if (dashboardPreview) summary.dashboardPreviews++;
            else if (categorySubset) summary.categorySubsets++;
            else if (partial) summary.partialLists++;
            else {
                const component = url.searchParams.get('source-request-component-name');
                if (!['OFFERS_HUB_ALL', 'OFFERS_HUB_CAROUSELS'].includes(component)
                    || url.searchParams.get('offer-count') !== ''
                    || url.searchParams.get('offerStatusNameList') !== 'NEW,ACTIVATED,SERVED') {
                    throw new Error('An unknown full-list request contract requires review.');
                }
            }
            let accepted = false;
            try {
                harness.normalizeOffers(payload, harness.currentSession().accountId, context.enterprisePartyIdentifier);
                accepted = true;
            } catch {
                if (!dashboardPreview && !categorySubset && !partial) throw new Error('A full-list response failed strict normalization.');
            }
            if (partial && accepted) throw new Error('An incomplete list was incorrectly accepted.');
            if (!dashboardPreview && !categorySubset && !partial) summary.completeLists++;
        }
        if (!summary.successfulReads || !summary.completeLists) throw new Error('No successful full-list samples were found.');
        console.log(JSON.stringify({ ...summary, ...inspectClickEvidence(entries, harness),
            boundary: 'Local HAR evidence only; no requests replayed. Click/count correlation does not replace exact per-offer ACTIVATED readback in the implementation.' }, null, 2));
        if (summary.observedNonGetRequests) {
            console.error('Non-GET samples require separate contract review; no activation success is inferred.');
            process.exitCode = 1;
        }
    } catch {
        // Avoid echoing parser errors or assertion values from account data.
        console.error('Chase HAR validation failed. Review the external capture locally; private values were suppressed.');
        process.exitCode = 1;
    }
}
