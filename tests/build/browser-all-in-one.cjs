const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { loadAllInOneManifest } = require('../../scripts/build/all-in-one-manifest.cjs');

const scripts = loadScriptRegistry();
const manifest = loadAllInOneManifest(scripts);
const userscript = readFileSync(join(projectRoot, `dist/${manifest.id}.user.js`), 'utf8');
const seeds = {};
for (const script of scripts) {
    const prefix = `issuer:${script.id}:`;
    if (script.issuer === 'amex') {
        seeds[prefix + `${script.id}:view`] = { schemaVersion: 1, filter: 'synthetic', minimized: false };
        continue;
    }
    const perCard = ['citi', 'chase'].includes(script.issuer);
    const offer = script.issuer === 'bank-of-america'
        ? { id: 'offer-a', name: 'synthetic', headline: 'Synthetic offer', eligible: true, activated: false, reason: '', result: '' }
        : { accountId: 'card-a', offerId: 'offer-a', status: 'AVAILABLE', merchant: 'synthetic', title: 'Synthetic offer', category: '', starts: '', expires: '' };
    seeds[prefix + `${script.id}:workspace`] = {
        schemaVersion: 1, savedAt: 1800000000000, lastScanAt: 1800000000000,
        scopeIdentity: '', consent: true, search: 'synthetic', collapsed: false,
        accounts: perCard ? [{ accountId: 'card-a', name: 'Synthetic card', lastFour: '0000', eligible: true }] : [],
        offers: [offer], selected: perCard ? ['card-a'] : script.issuer === 'usbank' ? ['offer-a'] : []
    };
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const script of scripts) {
            const page = await browser.newPage();
            page.setDefaultTimeout(5000);
            const errors = [], requests = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.install();
            await page.route('**/*', async route => {
                if (!route.request().isNavigationRequest()) {
                    requests.push(route.request().url());
                    return route.abort();
                }
                await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head>
                    <script>window.observerAtPageStart = window.fetch.name;</script>
                    </head><body><h1>Synthetic bank fixture</h1></body></html>` });
            });
            // One init script makes storage setup and document-start execution ordered.
            await page.addInitScript({ content: `
                window.unsafeWindow = window;
                window.syntheticStore = JSON.parse(sessionStorage.getItem('fixture-storage') || ${JSON.stringify(JSON.stringify(seeds))});
                window.GM_getValue = (key, fallback) => structuredClone(window.syntheticStore[key] ?? fallback);
                window.GM_setValue = (key, value) => {
                    window.syntheticStore[key] = structuredClone(value);
                    sessionStorage.setItem('fixture-storage', JSON.stringify(window.syntheticStore));
                };
                ${userscript}` });
            await page.goto(script.matches[0].replaceAll('*', 'sample'));
            await page.clock.runFor(5000);
            const hostId = script.id + (script.issuer === 'amex' ? '-ui' : '');
            await page.locator(`[id="${hostId}"]`).waitFor();
            assert.equal(await page.locator('.hub-eyebrow').innerText(), 'CARD OFFER HUB');
            assert.equal(await page.getByRole('button', { name: 'Search all banks', exact: true }).count(), 1);
            const accent = await page.locator(`[id="${hostId}"]`).evaluate(element => getComputedStyle(element).getPropertyValue('--hub-accent').trim());
            assert.equal(accent, '#176653', 'all banks share the same design tokens');
            assert.deepEqual(await page.locator('.hub-step > h3').allTextContents(), ['1. Choose scope', '2. Scan offers', '3. Review & add']);
            for (const name of ['Scan offers', 'Stop', 'Add all offers', 'Clear search']) {
                assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1);
            }
            const bulkBeforeSearch = await page.getByRole('button', { name: 'Add all offers', exact: true }).innerText();
            const panelIds = await page.evaluate(() => [...document.querySelectorAll('body > div')]
                .filter(node => node.shadowRoot).map(node => node.id));
            assert.deepEqual(panelIds, [hostId], 'only the matching issuer panel may mount');
            assert.equal(await page.evaluate(() => window.observerAtPageStart === 'observedChaseFetch'), script.issuer === 'chase');
            if (script.issuer !== 'amex') {
                assert.equal(await page.locator('.offer').count(), 1, 'saved result restores');
                assert.ok(await page.getByRole('checkbox', { checked: true }).count() > 0, 'saved choice restores');
            }
            const search = page.getByRole('searchbox');
            if (await search.count()) {
                assert.equal(await search.inputValue(), 'synthetic');
                await search.fill('changed query');
                assert.equal(await page.getByRole('button', { name: 'Add all offers', exact: true }).innerText(), bulkBeforeSearch,
                    'display filtering never changes the bulk scope or label');
            } else {
                await page.getByRole('checkbox').uncheck();
            }
            const beforeReload = await page.evaluate(() => window.syntheticStore);
            const otherEntries = Object.entries(seeds).filter(([key]) => !key.startsWith(`issuer:${script.id}:`));
            for (const [key, value] of otherEntries) assert.deepEqual(beforeReload[key], value, 'other banks remain unchanged');
            assert.deepEqual(requests, [], 'restoration and preference edits are offline');
            await page.reload();
            await page.clock.runFor(60000);
            if (await search.count()) assert.equal(await search.inputValue(), 'changed query');
            else assert.equal(await page.getByRole('checkbox').isChecked(), false);
            await page.addScriptTag({ content: userscript });
            assert.equal(await page.locator(`[id="${hostId}"]`).count(), 1, 'reinjection is idempotent');
            assert.deepEqual(requests, [], 'reloading must never scan or resume');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('PASS: all-in-one on six synthetic bank sites, early Chase observer, one matching panel, isolated storage, saved results and choices, reload, and no automatic requests.');
    } finally {
        await browser.close();
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
