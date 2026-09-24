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
    control.setAttribute('aria-label', label);
    control.onclick = handler;
    return control;
}

function createUI() {
    if (panelRoot?.isConnected || document.getElementById(PANEL_ELEMENT_ID)) return;
    panelRoot = element('div');
    panelRoot.id = PANEL_ELEMENT_ID;
    const shadow = panelRoot.attachShadow({ mode: 'open' });
    const scope = `<div class="actions hub-scope-actions"><button id="btn-detect" aria-label="Detect cards">Detect cards</button><button id="btn-refresh-cards" aria-label="Refresh cards">Refresh cards</button></div>
        <p id="whitelist-summary" class="muted"></p><div id="card-list" class="cards"></div>
        <p class="muted hub-fine-print">Drag cards or use the arrows to change priority.</p><p id="saved-cards-status" class="muted hub-fine-print" role="status"></p>`;
    let markup = hubWorkflowMarkup(scope, { bank: 'Amex', template: offerWorkflow });
    for (const [from, to] of Object.entries({ body: 'content', scan: 'btn-scan', stop: 'btn-stop', search: 'input-search', add: 'btn-enroll-all', offers: 'offer-list', counts: 'offer-summary', 'workspace-cache': 'saved-offers-status' })) {
        markup = markup.replace(`id="${from}"`, `id="${to}"`);
    }
    shadow.innerHTML = `<style>${PANEL_STYLES}</style>${markup}`;
    shadow.querySelector('h2').textContent = __USERSCRIPT_NAME__;
    const at = id => shadow.getElementById(id);
    at('btn-detect').onclick = () => detectCards();
    at('btn-refresh-cards').onclick = () => detectCards({ forceRefresh: true });
    at('btn-scan').onclick = () => startScan();
    at('btn-stop').onclick = cancelRun;
    at('btn-enroll-all').onclick = () => startEnrollment();
    const filter = at('input-search');
    filter.value = state.filter;
    const updateFilter = () => {
        state.filter = filter.value.trim().toLowerCase();
        persistViewSettings(); renderOffers(); renderControls();
    };
    filter.oninput = updateFilter;
    at('hub-clear-search').onclick = () => { filter.value = ''; updateFilter(); filter.focus(); };
    const toggle = at('collapse');
    toggle.id = 'btn-toggle';
    toggle.onclick = () => { state.minimized = !state.minimized; persistViewSettings(); renderControls(); };
    const footer = shadow.querySelector('footer');
    const activity = element('details');
    activity.append(element('summary', 'Activity'));
    const logs = element('div', '', 'logs');
    logs.id = 'logs';
    activity.append(logs);
    const cooldown = element('p', '', 'muted');
    cooldown.id = 'cooldown';
    footer.append(cooldown, activity);
    decorateHubPanel(shadow, SETTINGS.version);
    shadow.getElementById('btn-toggle').setAttribute('aria-label', 'Minimize Amex panel');
    document.body.append(panelRoot);
    render();
}
