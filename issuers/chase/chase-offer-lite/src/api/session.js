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
        if (!Array.isArray(pathParameters.primaryDigitalAccountIdentifierList)
            || pathParameters.primaryDigitalAccountIdentifierList.length !== 1) return null;
        const enterprisePartyIdentifier = chaseIdentifier(pathParameters.enterprisePartyIdentifier);
        const accountId = chaseIdentifier(pathParameters.primaryDigitalAccountIdentifierList[0]);
        if (!headers['x-jpmc-csrf-token'] || /[\r\n]/.test(headers['x-jpmc-csrf-token'])) return null;
        const safeHeaders = {};
        for (const name of CHASE_SESSION_HEADER_NAMES) if (headers[name]) safeHeaders[name] = headers[name];
        const sequence = ++chaseSessionRequestSequence;
        if (chaseCapturedSession && chaseCapturedSession.enterprisePartyIdentifier !== enterprisePartyIdentifier) {
            chaseCapturedSession = null;
            chaseCapturedAccounts = null;
        }
        return { accountId, enterprisePartyIdentifier, headers: safeHeaders, sequence };
    } catch { return null; }
}
function captureSessionResponse(context, payload) {
    if (!context || context.sequence !== chaseSessionRequestSequence) return false;
    try {
        const accounts = normalizeAccounts(payload);
        if (chaseIdentifier(payload.primaryIndividualEnterprisePartyIdentifier) !== context.enterprisePartyIdentifier
            || !accounts.some(account => account.accountId === context.accountId)
            || !Array.isArray(payload.customerOffers)
            || !payload.customerOffers.some(account => chaseIdentifier(account.digitalAccountIdentifier) === context.accountId)) return false;
        // Only discovery fields survive observation. Impression/session tokens,
        // credentials and the native offer payload stay in memory. Workspace snapshots
        // separately retain normalized display records and the non-secret profile ID.
        chaseCapturedAccounts = { digitalProfileAccounts: payload.digitalProfileAccounts.map(card => ({
            digitalAccountIdentifier: chaseIdentifier(card.digitalAccountIdentifier),
            accountNickname: typeof card.accountNickname === 'string' ? card.accountNickname : '',
            accountProductClassificationName: typeof card.accountProductClassificationName === 'string' ? card.accountProductClassificationName : '',
            maskedAccountNumber: typeof card.maskedAccountNumber === 'string' ? card.maskedAccountNumber.slice(-4) : '',
            shoppingEligibilityIndicator: card.shoppingEligibilityIndicator
        })) };
        chaseCapturedSession = { ...context, headers: { ...context.headers }, capturedAt: Date.now() };
        return true;
    } catch { return false; }
}
function currentSession() {
    if (!chaseCapturedSession) throw new Error('Open Chase Offers or switch cards there, then detect cards again. Session data stays in this tab only.');
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
