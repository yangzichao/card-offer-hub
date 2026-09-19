function installHubSearchLauncher(configuration) {
    const mount = () => {
        const root = (document.getElementById(configuration.id) || document.getElementById(`${configuration.id}-ui`))?.shadowRoot;
        if (!root || root.querySelector('.hub-search-launcher')) return;
        const header = root.querySelector('header');
        if (!header) return;
        const launcher = hubNode('button', '', 'hub-search-launcher');
        launcher.type = 'button';
        launcher.setAttribute('aria-label', 'Search all banks');
        launcher.append(hubNode('span', 'Search all banks'), hubNode('span', 'Your saved offers ↗'));
        launcher.onclick = () => openHubSearch(launcher);
        header.after(launcher);
    };
    const ready = () => {
        mount();
        // UI repair only, matching the Amex panel's existing SPA remount behavior.
        new MutationObserver(mount).observe(document.body, { childList: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
}
