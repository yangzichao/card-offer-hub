// --- Init ---
installSessionObserver();
restorePacing();
restoreWorkspace();
if (state.restoredWorkspace && !state.storageError) {
    state.status = 'Saved results and selections restored. Use Add saved offers to continue, or Refresh & add offers to check for new ones.';
}
if (document.body) mountPanel();
else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
