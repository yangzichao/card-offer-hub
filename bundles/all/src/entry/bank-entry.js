// Public/login/alternate bank hosts get a useful entry without starting an API
// adapter on an origin whose session and endpoints it does not understand.
function installHubBankEntry(configuration) {
    const guardKey = `__cardOfferHubEntry_${configuration.id}`;
    if (window[guardKey]) return;
    window[guardKey] = true;
    const host = hubNode('div');
    host.id = `${configuration.id}-entry`;
    const root = host.attachShadow({ mode: 'open' });
    const style = hubNode('style', HUB_DESIGN_STYLES);
    const panel = hubNode('div', '', 'panel');
    const header = hubNode('header');
    header.append(hubNode('h2', configuration.label));
    const toggle = hubNode('button', '−');
    toggle.setAttribute('aria-label', 'Collapse Card Offer Hub');
    toggle.setAttribute('aria-expanded', 'true');
    header.append(toggle);
    const content = hubNode('section');
    content.id = 'hub-entry-content';
    toggle.setAttribute('aria-controls', content.id);
    content.append(hubNode('p', 'Open your bank’s Offers page to scan or add offers. Sign in there if needed.'));
    const actions = hubNode('div', '', 'actions');
    const offers = hubNode('a', `Open ${configuration.label} offers`);
    offers.href = configuration.offersUrl;
    offers.setAttribute('aria-label', `Open ${configuration.label} offers`);
    const search = hubNode('button', 'Search all banks');
    search.setAttribute('aria-label', 'Search all banks');
    search.onclick = () => openHubSearch(search);
    actions.append(offers, search);
    content.append(actions);
    toggle.onclick = () => {
        content.hidden = !content.hidden;
        toggle.textContent = content.hidden ? '+' : '−';
        toggle.setAttribute('aria-expanded', String(!content.hidden));
        toggle.setAttribute('aria-label', `${content.hidden ? 'Expand' : 'Collapse'} Card Offer Hub`);
    };
    panel.append(header, content);
    root.append(style, panel);
    decorateHubPanel(root, configuration.version);
    const mount = () => { if (document.body && !host.isConnected) document.body.append(host); };
    mount();
    // Event-driven repair when a bank's SPA replaces the page shell.
    new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
}
