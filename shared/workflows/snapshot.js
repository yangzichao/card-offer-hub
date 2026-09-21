// Version 1 belongs to the bank's established namespace. Migrate in memory,
// preserving every field; write version 2 only on the next explicit save.
function hubMigrateWorkflowSnapshot(snapshot, workflowType) {
    if (!snapshot || ![1, 2].includes(snapshot.schemaVersion)
        || (snapshot.schemaVersion === 2 && snapshot.workflowType !== workflowType)
        || (snapshot.workflowType !== undefined && snapshot.workflowType !== workflowType)) {
        throw new Error('Saved results belong to an unsupported workflow.');
    }
    return { ...snapshot, schemaVersion: 2, workflowType };
}
