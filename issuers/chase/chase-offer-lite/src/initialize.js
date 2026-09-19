// --- Init ---
installSessionObserver();
restorePacing();
if (document.body) mountPanel();
else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
