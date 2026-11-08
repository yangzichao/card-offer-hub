const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { readPublishedIssuerSource } = require('../helpers/published-issuer-source.cjs');
const { coupon, couponPage, clipResponse, contextHeaders } = require('./fixtures/coupons.cjs');

const script = readPublishedIssuerSource('kroger-coupon-lite');
const origin = 'https://www.kroger.com';
// The synthetic Coupons page loads its first list page with its own context
// headers, the way Kroger's application does. The script only observes it.
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Synthetic Kroger fixture</title></head>
<body><h1>Coupons · synthetic test page</h1><script>
fetch('/atlas/v1/savings-coupons/v2/coupons?page.offset=0', { headers: ${JSON.stringify(contextHeaders)} });
</script></body></html>`;

async function fixture(browser, { clipMode = 'confirm' } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = [], pageReads = [], scriptRequests = [];
    const coupons = [...Array.from({ length: 74 }, (_, index) => coupon(String(1000001 + index))),
        coupon('2000001', { addedToCard: true })];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
    await page.addInitScript({ content: `
        localStorage.setItem('msal.2.account.keys', JSON.stringify(['synthetic-home-account']));
        window.unsafeWindow = window;
        window.fixtureStorage = {};
        window.GM_getValue = (key, fallback) => window.fixtureStorage[key] ?? fallback;
        window.GM_setValue = (key, value) => { window.fixtureStorage[key] = structuredClone(value); };
        ${script}` });
    await page.route('**/*', async route => {
        const request = route.request();
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml });
        const url = new URL(request.url());
        const headers = request.headers();
        if (url.origin !== origin) { errors.push(`Unexpected destination ${url.origin}`); return route.abort(); }
        if (url.pathname === '/atlas/v1/savings-coupons/v2/coupons') {
            const offset = Number(url.searchParams.get('page.offset'));
            (headers['x-call-origin'] ? scriptRequests : pageReads).push({ kind: 'list', offset, headers });
            const slice = coupons.slice(offset, offset + 72);
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(couponPage(slice, offset + slice.length < coupons.length, offset)) });
        }
        if (url.pathname === '/atlas/v1/savings-coupons/v1/clip-unclip' && request.method() === 'POST') {
            const body = request.postDataJSON();
            scriptRequests.push({ kind: 'clip', couponId: body.couponId, headers });
            if (clipMode === '429') return route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, contentType: 'application/json', body: '{}' });
            const target = coupons.find(item => item.id === body.couponId);
            target.addedToCard = true;
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(clipResponse([target.krogerCouponNumber])) });
        }
        errors.push(`Unexpected path ${url.pathname}`);
        return route.abort();
    });
    await page.goto(`${origin}/savings/cl/coupons/`);
    await page.getByRole('button', { name: 'Clip all coupons', exact: true }).waitFor();
    async function advanceUntil(pattern) {
        for (let turn = 0; turn < 400; turn++) {
            if (pattern.test(await page.getByRole('status').innerText())) return;
            await page.clock.runFor(500);
        }
        throw new Error(`Did not reach ${pattern}: ${await page.getByRole('status').innerText()}`);
    }
    return { page, errors, pageReads, scriptRequests, coupons, advanceUntil };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const run = await fixture(browser);
        const { page } = run;
        await page.clock.runFor(60000);
        assert.equal(run.pageReads.length, 1, 'the page made its own first read');
        assert.deepEqual(run.scriptRequests, [], 'nothing runs before a click');
        const clip = page.getByRole('button', { name: 'Clip all coupons', exact: true });
        assert.equal(await clip.isEnabled(), true, 'one click works without loading first');
        assert.equal(await page.locator('.hub-primary-actions > button.primary:visible').count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Load coupons', exact: true }).count(), 1);
        await clip.click();
        await run.advanceUntil(/Finished: all 74 coupons clipped/);
        const reads = run.scriptRequests.filter(request => request.kind === 'list');
        const clips = run.scriptRequests.filter(request => request.kind === 'clip');
        assert.deepEqual(reads.map(request => request.offset), [0, 72]);
        assert.equal(clips.length, 74);
        assert.equal(new Set(clips.map(request => request.couponId)).size, 74, 'each coupon is sent once');
        for (const request of run.scriptRequests) {
            assert.equal(request.headers['x-laf-object'], contextHeaders['x-laf-object'], 'page context travels with script requests');
            assert.equal(request.headers['x-kroger-channel'], 'WEB');
        }
        assert.match(await page.locator('#counts').innerText(), /75 coupons · 0 ready · 75 clipped · 74\/74 clipped this run/);
        assert.equal(await page.getByRole('button', { name: 'Stop', exact: true }).count(), 0, 'Stop hides when idle');
        assert.equal(await page.getByRole('progressbar').count(), 0, 'progress hides when idle');
        assert.match(await clip.innerText(), /^Clip all coupons \(0\)$/);
        const saved = await page.evaluate(() => JSON.stringify(window.fixtureStorage['kroger-coupon-lite:workspace']));
        for (const secret of ['synthetic-home-account', 'x-laf-object', '900001000001']) assert.equal(saved.includes(secret), false, secret);

        // A second click reloads and finds nothing left, without any clip.
        const before = run.scriptRequests.length;
        await clip.click();
        await run.advanceUntil(/No coupons left to clip/);
        assert.equal(run.scriptRequests.slice(before).every(request => request.kind === 'list'), true);
        assert.deepEqual(run.errors, []);
        await page.close();

        const limited = await fixture(browser, { clipMode: '429' });
        await limited.page.getByRole('button', { name: 'Clip all coupons', exact: true }).click();
        await limited.advanceUntil(/HTTP 429/);
        assert.equal(limited.scriptRequests.filter(request => request.kind === 'clip').length, 1, '429 stops without retrying');
        assert.equal(await limited.page.getByRole('button', { name: 'Clip all coupons', exact: true }).isEnabled(), false, 'cooldown blocks a new run');
        await limited.page.clock.runFor(60000);
        assert.equal(limited.scriptRequests.filter(request => request.kind === 'clip').length, 1, 'no automatic resume');
        assert.deepEqual(limited.errors, []);
        console.log('PASS: Kroger one-click clip-all on a synthetic Coupons page: page context observed, serial clips, explicit confirmation, 429 stop, no automatic requests.');
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exit(1); });
