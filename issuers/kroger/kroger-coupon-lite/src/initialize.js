// --- Init ---
installKrogerContextObserver();
restorePacing();
restoreWorkspace();
if (state.restoredWorkspace && !state.storageError) {
    state.status = 'Saved coupons restored. Clip all coupons reloads the list before clipping.';
}
if (document.body) mountPanel();
else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
