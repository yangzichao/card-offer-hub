function serializeWorkspaceRecord(record, fields) {
    const normalized = {};
    for (const [field, type] of Object.entries(fields)) {
        normalized[field] = type === 'text' && typeof record[field] !== 'string' ? '' : record[field];
    }
    return workspaceRecord(normalized, fields);
}
// Only adapter-declared display fields enter persistent storage. Request tokens,
// raw responses, headers, locations and runtime locks never cross this boundary.
function workspaceRecord(record, fields) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid saved record');
    const result = {};
    for (const [field, type] of Object.entries(fields)) {
        const value = record[field];
        if (type === 'boolean') {
            if (typeof value !== 'boolean') throw new Error('Invalid saved flag');
            result[field] = value;
        } else {
            if (typeof value !== 'string' || (type === 'id' && !value.trim())) throw new Error('Invalid saved text');
            result[field] = value;
        }
    }
    return result;
}
function workspaceOfferKey(offer) {
    return JSON.stringify([offer.accountId || '', offer.offerId || offer.id]);
}
function validateWorkspaceSnapshot(saved, fields) {
    if (!saved || saved.schemaVersion !== 1 || !Number.isFinite(saved.savedAt) || saved.savedAt < 0
        || !Number.isFinite(saved.lastScanAt) || saved.lastScanAt < 0
        || typeof saved.scopeIdentity !== 'string' || typeof saved.consent !== 'boolean'
        || typeof saved.search !== 'string' || typeof saved.collapsed !== 'boolean'
        || !Array.isArray(saved.accounts) || !Array.isArray(saved.offers) || !Array.isArray(saved.selected)) {
        throw new Error('Unsupported or incomplete workspace snapshot');
    }
    const accounts = saved.accounts.map(record => workspaceRecord(record, fields.accounts));
    const offers = saved.offers.map(record => workspaceRecord(record, fields.offers));
    const accountIds = new Set(accounts.map(account => account.accountId));
    const offerIds = new Set(offers.map(workspaceOfferKey));
    if (accountIds.size !== accounts.length || offerIds.size !== offers.length
        || (!fields.accounts && accounts.length)
        || (fields.accounts && offers.some(offer => !accountIds.has(offer.accountId)))) {
        throw new Error('Conflicting saved records');
    }
    const allowedSelections = fields.accounts ? accountIds : new Set(offers.map(offer => offer.offerId));
    if (saved.selected.some(id => typeof id !== 'string' || !allowedSelections.has(id))
        || new Set(saved.selected).size !== saved.selected.length) throw new Error('Invalid saved selections');
    return { ...saved, accounts, offers };
}
