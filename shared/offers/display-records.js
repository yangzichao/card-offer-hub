function hubText(value) { return typeof value === 'string' ? value : ''; }
function hubTimestamp(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
function hubStatus(value) {
    if (['AVAILABLE', 'ELIGIBLE'].includes(value)) return 'available';
    if (['ENROLLED', 'ACTIVATED'].includes(value)) return 'added';
    if (['UNCONFIRMED', 'UNKNOWN', 'FAILED', 'CONFLICT'].includes(value)) return 'review';
    return 'other';
}
// Display records never authorize a request or contain request/session credentials.
function hubOfferRecord(bank, offer, context) {
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) throw new Error('Invalid saved offer');
    const merchant = hubText(offer.merchant), description = hubText(offer.description);
    if (!merchant && !description) throw new Error('Missing saved offer text');
    return { bankId: bank.id, bankName: bank.label, merchant, description,
        card: context.card || 'Account-wide', scannedAt: hubTimestamp(context.scannedAt),
        incomplete: Boolean(context.incomplete), status: offer.displayStatus,
        expires: hubText(offer.expires), category: hubText(offer.category), url: bank.url };
}
function hubWorkspaceDisplayRecords(bank, snapshot, normalizeOffer, workflowType) {
    snapshot = hubMigrateWorkflowSnapshot(snapshot, workflowType, 3);
    const cardScoped = HUB_WORKFLOW_TEMPLATES[workflowType].scope === 'card';
    if (!Array.isArray(snapshot.offers) || !Array.isArray(snapshot.accounts)) {
        throw new Error('Unsupported saved results');
    }
    const accounts = new Map(snapshot.accounts.map(account => {
        if (!account || typeof account.accountId !== 'string' || typeof account.name !== 'string') throw new Error('Invalid saved card');
        return [account.accountId, account.name];
    }));
    return snapshot.offers.map(offer => hubOfferRecord(bank, normalizeOffer(offer), {
        card: accounts.get(offer?.accountId) || (cardScoped ? 'Saved card' : 'Account-wide'),
        scannedAt: snapshot.lastScanAt
    }));
}
