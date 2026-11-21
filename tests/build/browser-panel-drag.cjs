const assert = require('node:assert/strict');
const { mkdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { projectRoot } = require('../../scripts/build/script-registry.cjs');

// The published all-in-one bundle on synthetic pages. Every non-navigation
// request is aborted and recorded. GM storage lives in this process, as
// userscript storage does, and is handed to each new document before it loads.
const userscript = readFileSync(join(projectRoot, 'dist/card-offer-hub-all.user.js'), 'utf8');
const SCREENSHOTS = resolve(projectRoot, 'work/browser');
const BOFA_KEY = 'issuer:bofa-offer-lite:bofa-offer-lite:panel-position';
const AMEX_KEY = 'issuer:amex-offer-lite:amex-offer-lite:panel-position';

async function openPage(browser, storage) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.setDefaultTimeout(5000);
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__persistGmValue', (key, value) => storage.set(key, value));
    await page.route('**/*', route => {
        if (!route.request().isNavigationRequest()) {
            requests.push(route.request().url());
            return route.abort();
        }
        const seed = JSON.stringify(Object.fromEntries(storage)).replace(/</g, '\\u003c');
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><script>window.__gmSeed = ${seed};</script></head>`
            + '<body style="background:#eef2f6;font-family:system-ui"><h1>Synthetic bank page</h1></body></html>' });
    });
    await page.addInitScript({ content: `window.unsafeWindow = window;
        window.__gmWrites = Promise.resolve();
        window.GM_getValue = (key, fallback) => window.__gmSeed && key in window.__gmSeed ? structuredClone(window.__gmSeed[key]) : fallback;
        window.GM_setValue = (key, value) => {
            if (window.__failGmWrites) throw new Error('Synthetic storage failure');
            (window.__gmSeed ||= {})[key] = structuredClone(value);
            window.__gmWrites = window.__gmWrites.then(() => window.__persistGmValue(key, structuredClone(value)));
        };
        ${userscript}` });
    return { page, requests, errors, flush: () => page.evaluate(() => window.__gmWrites) };
}
async function box(page, selector) {
    const bounds = await page.locator(selector).boundingBox();
    return { left: Math.round(bounds.x), top: Math.round(bounds.y), right: Math.round(bounds.x + bounds.width), bottom: Math.round(bounds.y + bounds.height) };
}
async function dragBy(page, handle, dx, dy) {
    const start = await page.locator(handle).boundingBox();
    const x = start.x + start.width / 2, y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
}
const assertInside = (bounds, width, height, message) => assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height,
    `${message}: ${JSON.stringify(bounds)} in ${width}x${height}`);

async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        const storage = new Map();
        const { page, requests, errors, flush } = await openPage(browser, storage);
        await page.goto('https://deals.merchant-rewards.com/');
        const host = '#bofa-offer-lite', title = '#bofa-offer-lite h2';
        await page.locator(host).waitFor();
        const move = page.getByRole('button', { name: 'Move panel' });
        assert.equal(await move.count(), 1, 'the panel has a Move panel control');
        let bounds = await box(page, host);
        assert.deepEqual([1200 - bounds.right, 900 - bounds.bottom], [16, 16], 'starts in the default bottom-right corner');

        // Minimize, then drag the small header to the top-left, like the screenshot.
        await page.getByRole('button', { name: 'Minimize Deals panel' }).click();
        const collapsed = await box(page, host);
        await dragBy(page, title, 100 - collapsed.left, 80 - collapsed.top);
        bounds = await box(page, host);
        assert.ok(Math.abs(bounds.left - 100) <= 1 && Math.abs(bounds.top - 80) <= 1, `dropped where released: ${JSON.stringify(bounds)}`);
        await flush();
        assert.deepEqual(storage.get(BOFA_KEY), { schemaVersion: 1, position: { horizontal: 'left', x: bounds.left, vertical: 'top', y: bounds.top } });

        // Expanding grows away from the top-left corner and stays inside the window.
        await page.getByRole('button', { name: 'Expand Deals panel' }).click();
        const expanded = await box(page, host);
        assert.deepEqual([expanded.left, expanded.top], [bounds.left, bounds.top], 'expanding keeps the top-left corner in place');
        assertInside(expanded, 1200, 900, 'expanded panel');
        mkdirSync(SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: resolve(SCREENSHOTS, 'panel-drag.png') });

        // Arrow keys move it; Shift moves farther.
        await move.focus();
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Shift+ArrowRight');
        const stepped = await box(page, host);
        assert.deepEqual([stepped.left - expanded.left, stepped.top - expanded.top], [64, -16]);
        for (let press = 0; press < 4; press++) await page.keyboard.press('ArrowDown');
        const moved = await box(page, host);
        assert.equal(moved.bottom, 892, 'a tall panel stops 8px above the bottom edge');
        await flush();
        const movedSpot = { horizontal: 'left', x: moved.left, vertical: 'bottom', y: 8 };
        assert.deepEqual(storage.get(BOFA_KEY).position, movedSpot, 'its center is now in the lower half, so it keeps to the bottom edge');

        // A new document restores the spot with no requests.
        await page.reload();
        await page.locator(host).waitFor();
        assert.deepEqual(await box(page, host).then(b => [b.left, b.top]), [moved.left, moved.top], 'restored after reload');

        // A smaller window pulls the panel inside without changing the saved spot.
        await page.setViewportSize({ width: 320, height: 600 });
        await page.waitForFunction(() => {
            const rect = document.getElementById('bofa-offer-lite').getBoundingClientRect();
            return rect.right <= innerWidth && rect.bottom <= innerHeight;
        });
        assertInside(await box(page, host), 320, 600, 'narrow window');
        await page.screenshot({ path: resolve(SCREENSHOTS, 'panel-drag-320.png') });
        await flush();
        assert.deepEqual(storage.get(BOFA_KEY).position, movedSpot, 'saved spot unchanged');
        await page.setViewportSize({ width: 1200, height: 900 });

        // Dragging past an edge stops 8px inside the window.
        const before = await box(page, host);
        await dragBy(page, title, -2000, -2000);
        assert.deepEqual(await box(page, host).then(b => [b.left, b.top]), [8, 8]);
        // Home puts it back in the default corner; so does a double-click on the header.
        await move.focus();
        await page.keyboard.press('Home');
        bounds = await box(page, host);
        assert.deepEqual([1200 - bounds.right, 900 - bounds.bottom], [16, 16], 'Home resets the corner');
        await flush();
        assert.deepEqual(storage.get(BOFA_KEY), { schemaVersion: 1, position: null });
        await dragBy(page, title, -300, -200);
        assert.notEqual((await box(page, host)).right, 1184);
        await page.locator(title).dblclick();
        bounds = await box(page, host);
        assert.deepEqual([1200 - bounds.right, 900 - bounds.bottom], [16, 16], 'double-click resets the corner');
        assert.ok(before.left > 8, 'the earlier spot was not already at the edge');

        // Buttons in the header still click instead of dragging.
        await page.getByRole('button', { name: 'Minimize Deals panel' }).click();
        assert.equal(await page.getByRole('button', { name: 'Expand Deals panel' }).count(), 1);
        await page.getByRole('button', { name: 'Expand Deals panel' }).click();

        // A failed save is visible on the panel.
        await page.evaluate(() => { window.__failGmWrites = true; });
        await dragBy(page, title, -200, -100);
        assert.equal(await page.locator('#bofa-offer-lite .hub-position-error').innerText(), 'Panel position could not be saved. It applies to this visit only.');
        await page.evaluate(() => { window.__failGmWrites = false; });
        await move.focus();
        await page.keyboard.press('Home');
        assert.equal(await page.locator('#bofa-offer-lite .hub-position-error').isHidden(), true, 'the next successful save clears the message');
        assert.deepEqual(requests, [], 'moving the panel sends nothing');
        assert.deepEqual(errors, []);

        // Amex: the entry panel on a public page and the offers panel share one spot.
        await page.goto('https://www.americanexpress.com/');
        const entry = '#amex-offer-lite-entry';
        await page.locator(entry).waitFor();
        const start = await box(page, entry);
        await dragBy(page, `${entry} h2`, 60 - start.left, 120 - start.top);
        const entryBounds = await box(page, entry);
        await flush();
        assert.deepEqual(storage.get(AMEX_KEY).position, { horizontal: 'left', x: entryBounds.left, vertical: 'top', y: entryBounds.top });
        await page.goto('https://global.americanexpress.com/offers');
        const amex = '#amex-offer-lite-ui';
        await page.locator(amex).waitFor();
        const amexExpanded = await box(page, amex);
        assert.equal(amexExpanded.left, entryBounds.left, 'the Amex panel opens where the entry was left');
        assertInside(amexExpanded, 1200, 900, 'the taller Amex panel is pulled inside the window');
        await page.getByRole('button', { name: 'Minimize Amex panel' }).click();
        // The resize observer re-places the panel on the next frame.
        await page.waitForFunction(top => Math.round(document.getElementById('amex-offer-lite-ui').getBoundingClientRect().top) === top, entryBounds.top);
        const amexCollapsed = await box(page, amex);
        assert.deepEqual([amexCollapsed.left, amexCollapsed.top], [entryBounds.left, entryBounds.top], 'minimized, it fits at the saved spot again');
        await dragBy(page, `${amex} h2`, 1200 - 16 - amexCollapsed.right, 900 - 40 - amexCollapsed.bottom);
        const amexBounds = await box(page, amex);
        await flush();
        assert.deepEqual(storage.get(AMEX_KEY).position, { horizontal: 'right', x: 1200 - amexBounds.right, vertical: 'bottom', y: 900 - amexBounds.bottom });
        assert.equal(storage.get(BOFA_KEY).position, null, 'each bank keeps its own spot');
        assert.deepEqual(requests, [], 'no bank requests on any page');
        assert.deepEqual(errors, []);
        console.log('PASS: drag by header on bank, Amex and entry panels, nearest-corner save, expand away from the corner, arrow keys, reload, narrow window, edge clamp, Home and double-click reset, header buttons still click, visible save failure, per-bank keys, no requests.');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
