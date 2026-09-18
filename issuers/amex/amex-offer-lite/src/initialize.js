// --- Init ---
// One guard per published script, so several Card Offer Hub scripts can share a page.
const installGuardKey = `__cardOfferHubInstalled_${__USERSCRIPT_ID__}`;
if (window.top === window.self && !window[installGuardKey]) {
    window[installGuardKey] = true;
    restoreLocalSettings();
    createUI();
    // UI maintenance only. No detection, scanning, or enrollment runs on a timer.
    new MutationObserver(() => {
        if (!panelRoot?.isConnected) createUI();
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(refreshTimers, 1000);
}
