// All routing is local. Each adapter retains its original IIFE, constants and workflows.
function dispatchIssuer(configuration, startIssuer) {
    const pageUrl = location.origin + location.pathname + location.search;
    if (!configuration.patterns.some(pattern => new RegExp(pattern).test(pageUrl))) return;
    if (configuration.noFrames && window.top !== window.self) return;
    const start = () => {
        const guardKey = `__cardOfferHubAllStarted_${configuration.id}`;
        if (window[guardKey]) return;
        window[guardKey] = true;
        const storagePrefix = `issuer:${configuration.id}:`;
        startIssuer(
            (key, fallback) => GM_getValue(storagePrefix + key, fallback),
            (key, value) => GM_setValue(storagePrefix + key, value)
        );
    };
    // Chase must observe native requests before the page scripts run. The other
    // adapters need a parsed document for their panels, with no timer or request.
    if (configuration.runAt === 'document-start' || document.readyState !== 'loading') start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
}
