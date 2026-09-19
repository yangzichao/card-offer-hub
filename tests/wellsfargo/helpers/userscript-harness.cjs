const { webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

function bootstrap(action = '/deals-portal/as/activateCLDeal?token=synthetic-token') {
    return `window.initialState = JSON.parse(${JSON.stringify(JSON.stringify({ metadata: { clDealsActivateAction: action } }))});`;
}
function offer(id = '1001', extra = {}, detailOverrides = {}) {
    return { vendorName: 'CL', multiCardFlag: false, isActivated: false,
        merchantDealDetails: { merchantOfferId: id, status: 'AVAILABLE', merchantName: `Example ${id}`,
            shortDescription: '$5 back', expirationDate: '12/31/99', checkSum: 'synthetic-unused-checksum', ...detailOverrides }, ...extra };
}
function listing(records = [offer()], activatedDeals = []) {
    return { status: { statusCode: 200, messages: [{ type: 'INFO', code: 'SUCCESS' }] },
        data: JSON.stringify({ availableDeals: { count: 0, cardlyticsEligibleDeals: records, activatedDeals } }) };
}
function jsonResponse(payload, status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload) };
}
function createHarness(respond = () => jsonResponse(listing()), options = {}) {
    const source = readFileSync(resolve(__dirname, '../../../dist/wellsfargo-offer-lite.user.js'), 'utf8');
    const marker = '    // --- Init ---';
    let now = 1800000000000;
    let active = 0;
    let maximumActive = 0;
    const requests = [];
    const storage = options.storage || new Map();
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const context = {
        TextEncoder, crypto: webcrypto, Date: TestDate, URL, AbortController, console,
        location: { origin: 'https://web.secure.wellsfargo.com', pathname: '/auth/deals-portal' },
        document: { querySelectorAll: () => (options.scripts ?? [bootstrap()]).map(textContent => ({ textContent })) },
        navigator: { locks: { request: async (name, config, action) => action(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            options.onSave?.(key, value);
            if (options.failStorage) throw new Error('Synthetic storage failure');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, milliseconds) {
            if (milliseconds === 45000) return 1;
            options.onWait?.(context.wellsTestAccess);
            now += milliseconds;
            queueMicrotask(callback);
            return 2;
        }, clearTimeout() {},
        fetch: async (url, config) => {
            const request = { url, method: config.method, body: config.body ? JSON.parse(config.body) : undefined,
                config, startedAt: now };
            requests.push(request);
            active++;
            maximumActive = Math.max(maximumActive, active);
            let result;
            try { result = await respond(request, context.wellsTestAccess); }
            catch (error) { active--; throw error; }
            return { ...result, text: async () => {
                try { const body = await result.text(); now += options.responseDelay || 0; return body; }
                finally { request.finishedAt = now; active--; }
            } };
        }
    };
    const probe = `globalThis.wellsTestAccess = { state, SETTINGS, restoreWorkspace, saveWorkspace, requireWorkspaceSaved, markWorkspaceOfferPending, finishWorkspaceOffer,
        recordWorkspaceScan, workspaceScopeFingerprint, normalizeOffers,
        enrollmentBody, enrollmentConfirmed, activationUrl, retryAfterMilliseconds, restorePacing,
        requestJson, scanOffers, addAllOffers, stopRun };})();`;
    if (!source.includes(marker)) throw new Error('Missing test initialization boundary');
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    return { ...context.wellsTestAccess, requests, storage, context, maximumActive: () => maximumActive,
        advance: milliseconds => { now += milliseconds; } };
}
async function consentAndScan(harness) {
    await harness.scanOffers();
    harness.state.accountConsent = true;
}
module.exports = { bootstrap, offer, listing, jsonResponse, createHarness, consentAndScan };
