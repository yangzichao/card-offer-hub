const PANEL_ELEMENT_ID = `${__USERSCRIPT_ID__}-ui`;

function element(tagName, text = '', className = '') {
    const node = document.createElement(tagName);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function uiElement(identifier) {
    return panelRoot?.shadowRoot?.getElementById(identifier) || null;
}

function button(identifier, label, handler, className = '') {
    const control = element('button', label, className);
    control.id = identifier;
    control.type = 'button';
    control.onclick = handler;
    return control;
}

function createUI() {
    if (panelRoot?.isConnected || document.getElementById(PANEL_ELEMENT_ID)) return;
    panelRoot = element('div');
    panelRoot.id = PANEL_ELEMENT_ID;
    const shadow = panelRoot.attachShadow({ mode: 'open' });
    shadow.append(element('style', PANEL_STYLES));
    const panel = element('div', '', 'panel');
    const header = element('header');
    header.append(element('h2', `${__USERSCRIPT_NAME__} ${SETTINGS.version}`));
    const toggle = button('btn-toggle', 'Minimize', () => {
        state.minimized = !state.minimized;
        persistViewSettings();
        renderControls();
    });
    header.append(toggle);
    panel.append(header);
    const content = element('div');
    content.id = 'content';

    const discovery = element('section');
    discovery.append(element('h3', '1. Detect cards once'));
    discovery.append(element('p', 'Detect once. Reloading restores your saved cards and whitelist. Force refresh only when your card list changes.', 'muted'));
    const discoveryActions = element('div', '', 'actions');
    discoveryActions.append(button('btn-detect', 'Detect card list', () => detectCards(), 'primary'));
    discoveryActions.append(button('btn-refresh-cards', 'Force refresh card list', () => detectCards({ forceRefresh: true })));
    discovery.append(discoveryActions);
    content.append(discovery);

    const whitelist = element('section');
    whitelist.append(element('h3', '2. Choose your whitelist and offer priority'));
    whitelist.append(element('p', 'Drag a card, or use the arrows, to rank it. An offer several cards share is added only to the highest card that is eligible for it; an offer only one card has always goes to that card. Set this once — it is saved.', 'muted'));
    const summary = element('p', '', 'muted');
    summary.id = 'whitelist-summary';
    const savedCardsStatus = element('p', '', 'muted');
    savedCardsStatus.id = 'saved-cards-status';
    savedCardsStatus.setAttribute('role', 'status');
    const cards = element('div', '', 'cards');
    cards.id = 'card-list';
    whitelist.append(summary, savedCardsStatus, cards);
    content.append(whitelist);

    const scan = element('section');
    scan.append(element('h3', '3. Scan whitelist offers'));
    scan.append(element('p', 'Available + added offers · one request at a time · 0.5s minimum gap · no automatic retries', 'muted'));
    scan.append(element('p', 'Offers and card statuses are saved. Reloading shows saved results; use Scan whitelist to refresh them manually.', 'muted'));
    const scanActions = element('div', '', 'actions');
    scanActions.append(button('btn-scan', 'Scan whitelist', startScan, 'primary'));
    scanActions.append(button('btn-stop', 'Stop', cancelRun, 'stop'));
    scan.append(scanActions);
    content.append(scan);

    const offersSection = element('section');
    const filter = element('input');
    filter.type = 'search';
    filter.id = 'input-search';
    filter.value = state.filter;
    filter.placeholder = 'Filter scanned offers';
    filter.setAttribute('aria-label', 'Filter scanned offers');
    filter.oninput = () => {
        state.filter = filter.value.trim().toLowerCase();
        persistViewSettings();
        renderOffers();
        renderControls();
    };
    offersSection.append(filter);
    offersSection.append(element('p', 'Add all offers runs unattended: one offer per card, one request at a time, 0.5s apart, no retries. Stop takes effect immediately.', 'muted'));
    const enrollmentActions = element('div', '', 'actions');
    enrollmentActions.append(button('btn-enroll-all', 'Add all offers', () => startEnrollment(), 'primary'));
    offersSection.append(enrollmentActions);
    const offerSummary = element('p', '', 'muted');
    offerSummary.id = 'offer-summary';
    offersSection.append(offerSummary);
    const savedOffersStatus = element('p', '', 'muted');
    savedOffersStatus.id = 'saved-offers-status';
    savedOffersStatus.setAttribute('role', 'status');
    offersSection.append(savedOffersStatus);
    const offers = element('div', '', 'offers');
    offers.id = 'offer-list';
    offersSection.append(offers);
    content.append(offersSection);

    const statusArea = element('div');
    const status = element('p');
    status.id = 'status';
    status.setAttribute('role', 'status');
    const cooldown = element('p', '', 'muted');
    cooldown.id = 'cooldown';
    const logs = element('div', '', 'logs');
    logs.id = 'logs';
    statusArea.append(status, cooldown);
    scan.append(statusArea);
    const footer = element('details', '', 'status');
    footer.append(element('summary', 'Activity'), logs);
    content.append(footer);
    panel.append(content);
    shadow.append(panel);
    document.body.append(panelRoot);
    render();
}
