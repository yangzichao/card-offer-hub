const { readPublishedIssuerSource } = require('../../helpers/published-issuer-source.cjs');
const { webcrypto } = require('node:crypto');
const { runInNewContext } = require('node:vm');
const { listing, endpoint, sessionHeaders } = require('../fixtures/offers-response.cjs');

function createHarness(respond, options = {}) {
    const source = readPublishedIssuerSource('chase-offer-lite');
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
        TextEncoder, crypto: webcrypto, Date: TestDate, AbortController, URL, URLSearchParams, Headers, Request, Response, console,
        location: { origin: 'https://secure.chase.com', pathname: '/web/auth/dashboard' },
        document: { cookie: options.cookie ?? '', querySelector: () => null },
        navigator: { locks: { request: async (name, config, action) => action(options.locked ? null : {}) } },
        GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => {
            options.onSave?.(key, value);
            if (options.failStorage) throw new Error('Synthetic storage failure');
            storage.set(key, structuredClone(value));
        },
        setTimeout(callback, milliseconds) {
            if (milliseconds === 45000) return 1;
            options.onWait?.(context.chaseTestAccess);
            now += milliseconds;
            queueMicrotask(callback);
            return 2;
        }, clearTimeout() {},
        fetch: async (url, config) => {
            const request = { url, method: config.method, headers: config.headers,
                body: config.body, startedAt: now };
            requests.push(request);
            active++;
            maximumActive = Math.max(maximumActive, active);
            try {
                const result = await respond(request, context.chaseTestAccess);
                now += options.responseDelay || 0;
                request.finishedAt = now;
                return result;
            } finally { active--; }
        }
    };
    const probe = `globalThis.chaseTestAccess = { state, SETTINGS, restoreWorkspace, saveWorkspace, requireWorkspaceSaved, markWorkspaceOfferPending, finishWorkspaceOffer,
        recordWorkspaceScan, workspaceScopeFingerprint, normalizeAccounts, normalizeOffers,
        retryAfterMilliseconds, restorePacing, requestJson, detectCards, setCardSelected,
        scanOffers, addAllOffers, stopRun, captureSessionRequest, captureSessionResponse,
        sessionHeaders, currentSession, getCapturedAccountsPayload, buildOffersRequest, installSessionObserver };})();`;
    if (!source.includes(marker)) throw new Error('Missing test initialization boundary');
    runInNewContext(source.slice(0, source.indexOf(marker)) + probe, context);
    if (options.seedSession !== false) {
        const captured = context.chaseTestAccess.captureSessionRequest(endpoint, 'GET', sessionHeaders());
        context.chaseTestAccess.captureSessionResponse(captured, listing());
    }
    return { ...context.chaseTestAccess, requests, storage, context, maximumActive: () => maximumActive,
        advance: milliseconds => { now += milliseconds; } };
}
function jsonResponse(payload, status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => JSON.stringify(payload) };
}
function selectCards(harness, ids = ['101']) {
    harness.state.accounts = ids.map(accountId => ({ accountId, name: `Synthetic ${accountId}`, eligible: true }));
    harness.state.sessionIdentity = harness.currentSession().enterprisePartyIdentifier;
    ids.forEach(id => harness.setCardSelected(id, true));
}
module.exports = { createHarness, jsonResponse, selectCards };
