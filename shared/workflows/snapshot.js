// Version 1 belongs to the bank's established namespace. Migrate in memory,
// preserving fields; only an explicit save writes the migrated format.
// Workspaces use v3 recovery/selection flags; Amex offer snapshots remain v2.
function hubMigrateWorkflowSnapshot(snapshot, workflowType, targetVersion = 2) {
    if (!snapshot || ![1, 2, ...(targetVersion === 3 ? [3] : [])].includes(snapshot.schemaVersion)
        || (snapshot.schemaVersion >= 2 && snapshot.workflowType !== workflowType)
        || (snapshot.workflowType !== undefined && snapshot.workflowType !== workflowType)) {
        throw new Error('Saved results belong to an unsupported workflow.');
    }
    if (targetVersion === 3) {
        const selectionInitialized = snapshot.schemaVersion < 3 ? false : snapshot.selectionInitialized;
        const continuationBlocked = snapshot.schemaVersion < 3 ? false : snapshot.continuationBlocked;
        if (typeof selectionInitialized !== 'boolean' || typeof continuationBlocked !== 'boolean') {
            throw new Error('Invalid saved workspace recovery state.');
        }
        return { ...snapshot, schemaVersion: 3, workflowType, selectionInitialized, continuationBlocked };
    }
    return { ...snapshot, schemaVersion: 2, workflowType };
}
