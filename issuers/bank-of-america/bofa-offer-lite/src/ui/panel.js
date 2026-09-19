function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${HUB_DESIGN_STYLES}</style><div class="panel" aria-label="BankAmeriDeals controls"><header><h2></h2><button aria-label="Minimize Deals panel">−</button></header><main>
        <p>Current signed-in Deals profile only. Shopping-link and Upside offers are excluded. Activation may start an expiry window; review terms first.</p>
        <label class="card"><input type="checkbox" aria-label="Confirm activation for current Deals profile">Activate all eligible offers in this profile</label>
        <div class="actions"><button aria-label="Scan Deals offers">Scan</button><button class="primary" aria-label="Activate eligible Deals offers">Activate all</button><button aria-label="Stop Deals activation">Stop</button></div>
        <p class="workspace-cache muted"></p><p role="status" aria-live="polite"></p><div class="muted">0.5s between completed requests · no automatic retries</div><div class="offers"></div>
    </main></div>`;
    state.panel = root;
    root.querySelector('h2').textContent = SETTINGS.name;
    decorateHubPanel(root, SETTINGS.version);
    root.querySelector('header button').onclick = () => { state.collapsed = !state.collapsed; saveWorkspace(); renderPanel(); };
    root.querySelector('input').onchange = event => { state.consent = event.target.checked; saveWorkspace(); renderPanel(); };
    root.querySelector('[aria-label="Scan Deals offers"]').onclick = scanOffers;
    root.querySelector('[aria-label="Activate eligible Deals offers"]').onclick = activateOffers;
    root.querySelector('[aria-label="Stop Deals activation"]').onclick = stopRun;
    document.body.appendChild(host);
    renderPanel();
}
