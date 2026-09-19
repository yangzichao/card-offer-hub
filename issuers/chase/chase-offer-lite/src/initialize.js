// --- Init ---
installSessionObserver();
restorePacing();
restoreWorkspace();
if (document.body) mountPanel();
else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
