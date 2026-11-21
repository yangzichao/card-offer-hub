// All routing is local. Each adapter retains its original IIFE, constants and workflows.
// Each bank's storage is prefixed, so banks never read or overwrite each other's keys.
function hubIssuerStorage(configuration) {
    const storagePrefix = `issuer:${configuration.id}:`;
    return { get: (key, fallback) => GM_getValue(storagePrefix + key, fallback), set: (key, value) => GM_setValue(storagePrefix + key, value) };
}
function dispatchIssuer(configuration, startIssuer) {
    const pageUrl = location.origin + location.pathname + location.search;
    if (!configuration.entryPatterns.some(pattern => new RegExp(pattern).test(pageUrl))) return;
    if (configuration.noFrames && window.top !== window.self) return;
    if (!configuration.patterns.some(pattern => new RegExp(pattern).test(pageUrl))) {
        const mountEntry = () => installHubBankEntry(configuration);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountEntry, { once: true });
        else mountEntry();
        return;
    }
    const start = () => {
        const guardKey = `__cardOfferHubAllStarted_${configuration.id}`;
        if (window[guardKey]) return;
        window[guardKey] = true;
        const storage = hubIssuerStorage(configuration);
        startIssuer(storage.get, storage.set);
        installHubSearchLauncher(configuration);
    };
    // Chase must observe native requests before the page scripts run. The other
    // adapters need a parsed document for their panels, with no timer or request.
    if (configuration.runAt === 'document-start' || document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
}
