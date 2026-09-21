// --- Init ---
restorePacing();
restoreWorkspace();
if (state.restoredWorkspace && !state.storageError) {
    state.status = '';
}
mountPanel();
