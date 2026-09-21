function installHubSearchLauncher(configuration) {
    let panelHost;
    const mount = () => {
        const currentHost = document.getElementById(configuration.id) || document.getElementById(`${configuration.id}-ui`);
        if (currentHost) panelHost = currentHost;
        else if (panelHost && document.body) document.body.append(panelHost);
        const root = panelHost?.shadowRoot;
        if (!root || root.querySelector('.hub-search-launcher')) return;
        const header = root.querySelector('header');
        if (!header) return;
        const launcher = hubNode('button', '', 'hub-search-launcher');
        launcher.type = 'button';
        launcher.setAttribute('aria-label', 'Search all banks');
        launcher.append(hubNode('span', 'Search all banks'), hubNode('span', 'Your saved offers ↗'));
        launcher.onclick = () => openHubSearch(launcher);
        header.after(launcher);
        const offers = hubNode('a', `Open ${configuration.label} offers`);
        offers.href = configuration.offersUrl;
        offers.className = 'hub-search-launcher';
        offers.setAttribute('aria-label', `Open ${configuration.label} offers`);
        launcher.after(offers);
    };
    const ready = () => {
        mount();
        // UI repair only, matching the Amex panel's existing SPA remount behavior.
        new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
}
