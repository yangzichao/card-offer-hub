// --- Init ---
restorePacing();
restoreWorkspace();
if (state.restoredWorkspace && !state.storageError) {
    state.status = canContinueSavedOffers()
        ? 'Saved results and selections restored. Continue with Add all offers, or refresh all cards & offers if you want an updated list.'
        : 'Saved results and selections restored. Refresh all cards & offers to verify incomplete or unconfirmed results before adding.';
}
mountPanel();
