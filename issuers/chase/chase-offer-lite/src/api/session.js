let chaseCapturedSession = null;
let chaseCapturedAccounts = null;
let chaseSessionRequestSequence = 0;
const CHASE_SESSION_HEADER_NAMES = ['accept', 'channel-identifier', 'channel-type', 'x-jpmc-channel', 'x-jpmc-csrf-token', 'path-params'];
function chaseReadHeaders(input) {
    const headers = {};
    if (input && typeof input.forEach === 'function' && !Array.isArray(input)) {
        input.forEach((value, name) => { headers[String(name).toLowerCase()] = String(value); });
    } else if (Array.isArray(input)) {
        for (const [name, value] of input) headers[String(name).toLowerCase()] = String(value);
    } else if (input && typeof input === 'object') {
        for (const [name, value] of Object.entries(input)) headers[name.toLowerCase()] = String(value);
    }
    return headers;
}
function captureSessionRequest(requestUrl, method, requestHeaders) {
    try {
        const url = new URL(requestUrl, 'https://secure.chase.com');
        if (url.origin !== 'https://secure.chase.com' || url.pathname !== CHASE_OFFERS_PATH
            || String(method || 'GET').toUpperCase() !== 'GET') return null;
        const headers = chaseReadHeaders(requestHeaders);
        const pathParameters = JSON.parse(headers['path-params']);
        const requestedAccounts = pathParameters.primaryDigitalAccountIdentifierList;
        const dashboardDiscovery = Array.isArray(requestedAccounts) && requestedAccounts.length === 0
            && url.searchParams.get('source-request-component-name') === 'OVERVIEW_DASHBOARD'
            && url.searchParams.get('source-application-system-name') === 'CHASE_WEB'
            && url.searchParams.get('offer-count') === '12'
            && url.searchParams.get('offerStatusNameList') === 'NEW,ACTIVATED,SERVED'
            && !url.searchParams.has('offerCategoryCodeList');
        if (!Array.isArray(requestedAccounts) || (requestedAccounts.length !== 1 && !dashboardDiscovery)) return null;
        const enterprisePartyIdentifier = chaseIdentifier(pathParameters.enterprisePartyIdentifier);
        const accountId = dashboardDiscovery ? null : chaseIdentifier(requestedAccounts[0]);
        if (!headers['x-jpmc-csrf-token'] || /[\r\n]/.test(headers['x-jpmc-csrf-token'])) return null;
        const safeHeaders = {};
        for (const name of CHASE_SESSION_HEADER_NAMES) if (headers[name]) safeHeaders[name] = headers[name];
        const sequence = ++chaseSessionRequestSequence;
        if (chaseCapturedSession && chaseCapturedSession.enterprisePartyIdentifier !== enterprisePartyIdentifier) {
            chaseCapturedSession = null;
            chaseCapturedAccounts = null;
        }
        return { accountId, dashboardDiscovery, enterprisePartyIdentifier, headers: safeHeaders, sequence };
    } catch { return null; }
}
function captureSessionResponse(context, payload) {
    if (!context || context.sequence !== chaseSessionRequestSequence) return false;
    try {
        const accounts = normalizeAccounts(payload);
        if (chaseIdentifier(payload.primaryIndividualEnterprisePartyIdentifier) !== context.enterprisePartyIdentifier
            || !Array.isArray(payload.customerOffers)) return false;
        // The homepage asks Chase to choose its default card. Its limited offer
        // preview can establish discovery/session data, never a completed scan.
        if (context.dashboardDiscovery && (payload.customerOffers.length !== 1
            || !Array.isArray(payload.customerOffers[0]?.offers))) return false;
        const accountId = context.dashboardDiscovery
            ? chaseIdentifier(payload.customerOffers[0].digitalAccountIdentifier) : context.accountId;
        if (!accounts.some(account => account.accountId === accountId)
            || !payload.customerOffers.some(account => chaseIdentifier(account.digitalAccountIdentifier) === accountId)) return false;
        // Only discovery fields survive observation. Impression/session tokens,
        // credentials and the native offer payload stay in memory. Workspace snapshots
        // separately retain normalized display records and the non-secret profile ID.
        chaseCapturedAccounts = { digitalProfileAccounts: payload.digitalProfileAccounts.map(card => ({
            digitalAccountIdentifier: chaseIdentifier(card.digitalAccountIdentifier),
            accountNickname: typeof card.accountNickname === 'string' ? card.accountNickname : '',
            accountProductClassificationName: typeof card.accountProductClassificationName === 'string' ? card.accountProductClassificationName : '',
            maskedAccountNumber: typeof card.maskedAccountNumber === 'string' ? card.maskedAccountNumber.slice(-4) : ''
        })) };
        chaseCapturedSession = { ...context, accountId, headers: { ...context.headers }, capturedAt: Date.now() };
        return true;
    } catch { return false; }
}
function currentSession() {
    if (!chaseCapturedSession) throw new Error('Wait for Chase Offers to finish loading, then try again. Open Chase Offers or reload the page if needed.');
    const { accountId, enterprisePartyIdentifier, capturedAt } = chaseCapturedSession;
    return { accountId, enterprisePartyIdentifier, capturedAt };
}
function sessionHeaders() {
    currentSession();
    return { Accept: 'application/json', ...chaseCapturedSession.headers };
}
function getCapturedAccountsPayload() {
    currentSession();
    return { digitalProfileAccounts: chaseCapturedAccounts.digitalProfileAccounts.map(card => ({ ...card })) };
}
