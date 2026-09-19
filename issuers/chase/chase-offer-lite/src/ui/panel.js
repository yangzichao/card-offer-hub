function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const panel = host.attachShadow({ mode: 'open' });
    panel.innerHTML = `<style>${PANEL_STYLES}</style><div class="panel">
      <header><h2></h2><button id="collapse" aria-label="Minimize Chase panel" aria-expanded="true">−</button></header>
      <div id="body"><section>
        <p class="muted">Open Chase Offers, detect cards, select them manually, then scan. Requests are serial, at least 0.5 seconds apart. No automatic retries.</p>
        <button id="detect" aria-label="Detect Chase cards">Detect cards</button>
        <div id="cards" class="cards"></div>
        <div class="actions"><button id="scan" aria-label="Scan selected Chase cards">Scan selected</button>
        <button id="add" class="primary" aria-label="Scan and add all Chase offers" aria-describedby="enrollment-notice">Scan & add all</button>
        <button id="stop" aria-label="Stop Chase scan">Stop</button></div>
        <p id="enrollment-notice" class="notice">This version scans offers only. Add offers on the Chase website.</p>
        <p class="muted">Search only filters the display. Card selection controls the scan.</p>
      </section><section><p id="counts"></p><input id="search" type="search" aria-label="Search Chase offers" placeholder="Search merchants">
      <div id="offers" class="offers"></div></section>
      <footer><div id="status" role="status" aria-live="polite"></div><div id="storage-error" class="error" role="alert"></div></footer></div></div>`;
    panel.querySelector('h2').textContent = `${SETTINGS.name} ${SETTINGS.version}`;
    panel.getElementById('detect').addEventListener('click', detectCards);
    panel.getElementById('scan').addEventListener('click', scanOffers);
    panel.getElementById('add').addEventListener('click', addAllOffers);
    panel.getElementById('stop').addEventListener('click', stopRun);
    panel.getElementById('search').addEventListener('input', event => {
        state.search = event.target.value;
        renderOffers();
    });
    panel.getElementById('collapse').addEventListener('click', () => {
        state.collapsed = !state.collapsed;
        panel.getElementById('body').hidden = state.collapsed;
        const button = panel.getElementById('collapse');
        button.textContent = state.collapsed ? '+' : '−';
        button.setAttribute('aria-label', state.collapsed ? 'Expand Chase panel' : 'Minimize Chase panel');
        button.setAttribute('aria-expanded', String(!state.collapsed));
    });
    document.body.appendChild(host);
    state.panel = panel;
    renderPanel();
}
