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
        const launcher = hubNode('button', 'Search all banks', 'hub-search-launcher');
        launcher.type = 'button';
        launcher.setAttribute('aria-label', 'Search all banks');
        launcher.title = 'Search the offers you have saved across every bank';
        launcher.onclick = () => openHubSearch(launcher);
        const offers = hubNode('a', `Open ${configuration.label} offers`, 'hub-offers-link');
        offers.href = configuration.offersUrl;
        offers.setAttribute('aria-label', `Open ${configuration.label} offers`);
        const toolbar = hubNode('nav', '', 'hub-toolbar');
        toolbar.setAttribute('aria-label', 'Card Offer Hub shortcuts');
        toolbar.append(launcher, offers);
        // Inside the collapsible body, so a minimized panel shrinks to its header.
        const body = root.getElementById('body') || root.getElementById('content');
        if (body) body.prepend(toolbar);
        else header.after(toolbar);
    };
    const ready = () => {
        mount();
        // UI repair only, matching the Amex panel's existing SPA remount behavior.
        new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
}
