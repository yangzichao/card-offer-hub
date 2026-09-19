function mountPanel() {
    if (document.getElementById(SETTINGS.id)) return;
    const host = document.createElement('div');
    host.id = SETTINGS.id;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
        :host{all:initial;font:13px/1.45 system-ui;color:#172b45;position:fixed;right:18px;bottom:18px;z-index:2147483647}
        section{width:min(380px,calc(100vw - 36px));background:#fff;border:1px solid #c9d5e3;border-radius:12px;box-shadow:0 8px 32px #10254030;overflow:hidden}
        header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f0f5fb;font-weight:700}
        main{padding:14px}p{margin:0 0 12px}button{font:inherit;padding:8px 12px;border:1px solid #aabbd0;border-radius:6px;background:#f6f9ff;cursor:pointer}
        button:disabled{opacity:.45;cursor:default}.actions{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}label{display:flex;gap:8px;align-items:flex-start}
        [role=status]{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6fb;padding:10px;border-radius:6px}.offers{max-height:210px;overflow:auto;margin-top:12px}
        .offer{border-top:1px solid #e1e7ef;padding:8px 0;overflow-wrap:anywhere}.muted{color:#53657a;font-size:12px}[hidden]{display:none!important}
    </style><section aria-label="BankAmeriDeals controls"><header><span></span><button aria-label="Minimize Deals panel">−</button></header><main>
        <p>Current signed-in Deals profile only. Shopping-link and Upside offers are excluded. Activation may start an expiry window; review terms first.</p>
        <label><input type="checkbox" aria-label="Confirm activation for current Deals profile">Activate all eligible offers in this profile</label>
        <div class="actions"><button aria-label="Scan Deals offers">Scan</button><button aria-label="Activate eligible Deals offers">Activate all</button><button aria-label="Stop Deals activation">Stop</button></div>
        <p class="workspace-cache muted"></p><p role="status" aria-live="polite"></p><div class="muted">0.5s between completed requests · no automatic retries</div><div class="offers"></div>
    </main></section>`;
    state.panel = root;
    root.querySelector('header span').textContent = `${SETTINGS.name} · ${SETTINGS.version}`;
    root.querySelector('header button').onclick = () => { state.collapsed = !state.collapsed; saveWorkspace(); renderPanel(); };
    root.querySelector('input').onchange = event => { state.consent = event.target.checked; saveWorkspace(); renderPanel(); };
    root.querySelector('[aria-label="Scan Deals offers"]').onclick = scanOffers;
    root.querySelector('[aria-label="Activate eligible Deals offers"]').onclick = activateOffers;
    root.querySelector('[aria-label="Stop Deals activation"]').onclick = stopRun;
    document.body.appendChild(host);
    renderPanel();
}
