// Canonical records are transient: source points to the issuer's record and is
// never persisted. Ownership fields are strict so one model cannot mimic another.
function hubRequireWorkflowId(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Workflow requires ${label}.`);
    return value;
}
function hubValidateWorkflowRecord(record, ownershipFields) {
    if (!record || typeof record !== 'object') throw new Error('Invalid workflow offer.');
    hubRequireWorkflowId(record.offerId, 'offerId');
    if (!['available', 'added', 'unconfirmed', 'unavailable'].includes(record.status)) {
        throw new Error('Invalid workflow offer status.');
    }
    for (const field of ['cardId', 'accountId', 'groupId']) {
        if (ownershipFields.includes(field)) hubRequireWorkflowId(record[field], field);
        else if (Object.hasOwn(record, field)) throw new Error(`This workflow does not accept ${field}.`);
    }
    return record;
}
function hubWorkflowSelection(context, field) {
    const identifiers = context[field];
    if (!Array.isArray(identifiers) || new Set(identifiers).size !== identifiers.length) {
        throw new Error(`Workflow requires unique ${field}.`);
    }
    identifiers.forEach(identifier => hubRequireWorkflowId(identifier, field));
    return new Set(identifiers);
}
function hubUniqueWorkflowRecords(records, identity) {
    const unique = new Map();
    for (const record of records) {
        const key = identity(record);
        if (unique.has(key) && unique.get(key).status !== record.status) {
            throw new Error('Conflicting offer states. Refresh offers before adding.');
        }
        if (!unique.has(key)) unique.set(key, record);
    }
    return [...unique.values()];
}
