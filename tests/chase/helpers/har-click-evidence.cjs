const clickEndpoint = 'https://reco.chase.com/events/recoengine/public/recommendation/ccb/sales-relationship/crm/personalization-recommendation-interactions/v2/customer-interaction';
function readBody(entry) {
    const content = entry.response.content;
    const text = content.encoding === 'base64' ? Buffer.from(content.text, 'base64').toString('utf8') : content.text;
    return JSON.parse(text);
}
function inspectClickEvidence(entries, harness) {
    const profiles = new Map();
    const pending = new Map();
    const summary = { availableOffers: 0, availableOffersWithClickDetails: 0,
        matchedClickSamples: 0, clicksFollowedByCountIncrease: 0 };
    for (const entry of entries) {
        const url = new URL(entry.request.url);
        if (entry.request.method !== 'GET' || entry.response.status !== 200) continue;
        if (url.origin === 'https://secure.chase.com' && url.pathname.endsWith('/v3/customer-offers')) {
            const payload = readBody(entry);
            for (const account of payload.customerOffers || []) {
                if (account.partial !== false || account.totalAvailableOfferCount !== account.offers?.length) continue;
                const identity = String(payload.primaryIndividualEnterprisePartyIdentifier);
                const accountId = String(account.digitalAccountIdentifier);
                const offers = harness.normalizeOffers(payload, accountId, identity);
                const available = offers.filter(offer => ['NEW', 'SERVED'].includes(offer.status));
                summary.availableOffers += available.length;
                summary.availableOffersWithClickDetails += available.filter(offer => offer.activationParameters).length;
                profiles.set(JSON.stringify([identity, accountId]), { offers, count: account.totalActivatedOfferCount });
            }
        } else if (`${url.origin}${url.pathname}` === clickEndpoint && url.searchParams.get('recommendation-event-type-code') === 'CLICK') {
            const parameters = url.searchParams;
            const key = JSON.stringify([parameters.get('enterprise-party-identifier'), parameters.get('digital-account-identifier')]);
            const profile = profiles.get(key);
            const offer = profile?.offers.find(offer => offer.offerId === parameters.get('offer-identifier'));
            if (!offer?.activationParameters) throw new Error('Click has no matching complete scan.');
            const expected = new URLSearchParams(offer.activationParameters);
            if (![...expected].every(([name, value]) => parameters.getAll(name).length === 1 && parameters.get(name) === value)) {
                throw new Error('Click differs from supplied offer credentials.');
            }
            summary.matchedClickSamples++;
            pending.set(key, (pending.get(key) || 0) + 1);
        } else if (url.origin === 'https://secure.chase.com' && url.pathname.endsWith('/digital-customer-targeted-offers/offer-summaries')) {
            const headers = Object.fromEntries(entry.request.headers.map(header => [header.name.toLowerCase(), header.value]));
            const parameters = JSON.parse(headers['path-params']);
            const key = JSON.stringify([String(parameters.enterprisePartyIdentifier), String(parameters.digitalAccountIdentifier)]);
            const profile = profiles.get(key);
            const count = readBody(entry).summaryInfo?.totalActivatedOfferCount;
            if (profile && Number.isInteger(count)) {
                // Correlation is separate from exact per-offer verification.
                if (pending.get(key) === 1 && count === profile.count + 1) summary.clicksFollowedByCountIncrease++;
                profile.count = count;
                pending.delete(key);
            }
        }
    }
    return summary;
}
module.exports = { inspectClickEvidence };
