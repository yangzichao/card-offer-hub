const assert = require('node:assert/strict');
const { mkdirSync, readFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { fixture } = require('../citi/helpers/browser-fixture.cjs');

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const test = await fixture(browser);
        const { page, requests, bankState } = test;
        const profile = () => page.evaluate(() => window.fixtureStorage['citi-offer-lite:pacing']);
        const reload = async () => { await page.reload(); await page.addScriptTag({ content: test.script }); };
        async function finishLargeBatch() {
            // Each intercepted request/body may settle on a separate clock turn.
            for (let turn = 0; turn < 400; turn++) {
                if (/Finished: 75\/75/.test(await test.status())) return;
                await page.clock.runFor(1000);
            }
            throw new Error(`Batch did not finish: ${await test.status()}`);
        }
        assert.equal(requests.length, 0);
        bankState.offerIds = Array.from({ length: 75 }, (_, index) => `adaptive-${index}`);
        await test.selectCard();
        await page.getByRole('button', { name: 'Add saved offers', exact: true }).click();
        await finishLargeBatch();
        const learned = await profile();
        assert.equal(learned.schemaVersion, 2);
        assert.ok(learned.currentGapMs >= 900 && learned.currentGapMs < 1000);
        assert.equal(learned.currentGapMs % 50, 0);
        assert.equal(learned.lastStableGapMs, learned.currentGapMs + 50);
        assert.equal(test.maximumActive(), 1);
        const beforeReload = requests.length;
        await reload();
        assert.equal(requests.length, beforeReload);
        assert.deepEqual(await profile(), learned, 'loading a page does not rewrite its learned profile');
        const details = page.getByText('Automatic request speed', { exact: true });
        await details.click();
        assert.ok((await page.locator('#hub-pacing-details').innerText()).includes(`${(learned.currentGapMs / 1000).toFixed(2)}s`));
        mkdirSync('work/browser', { recursive: true });
        await page.screenshot({ path: 'work/browser/citi-adaptive-pacing.png', fullPage: true });

        bankState.offerIds.push('after-learning');
        bankState.mode = '429';
        await page.getByRole('button', { name: 'Refresh & add offers', exact: true }).click();
        await test.advanceUntil(/HTTP 429/);
        const limited = await profile();
        assert.equal(limited.currentGapMs, learned.currentGapMs * 2);
        assert.equal(limited.successCount, 0);
        assert.equal(limited.consecutiveLimits, 1);
        assert.ok(limited.cooldownUntil >= requests.at(-1).time + 600000);
        const afterLimit = requests.length;
        await reload();
        assert.deepEqual(await profile(), limited);
        await page.clock.runFor(601000);
        assert.equal(requests.length, afterLimit, 'cooldown expiry never resumes or retries a request');
        await page.getByText('Automatic request speed', { exact: true }).click();
        const downloadPending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save debug log', exact: true }).click();
        const download = await downloadPending;
        assert.match(download.suggestedFilename(), /^card-offer-hub-citi-offer-lite-\d+\.json$/);
        const report = JSON.parse(readFileSync(await download.path(), 'utf8'));
        assert.equal(report.profile.currentGapMs, limited.currentGapMs);
        assert.ok(report.events.some(event => event.kind === 'rate-limited' && event.httpStatus === 429));
        assert.ok(report.events.length <= 200);
        assert.equal(JSON.stringify(report).includes('card-a'), false);
        assert.equal(JSON.stringify(report).includes('adaptive-'), false);
        assert.equal(requests.length, afterLimit, 'saving a diagnostic file sends no bank requests');
        await page.locator('#hub-save-debug').scrollIntoViewIfNeeded();
        await page.screenshot({ path: 'work/browser/citi-debug-export.png', fullPage: true });
        assert.deepEqual(test.errors, []);
        await test.context.close();
        console.log('PASS: learned pacing, reload, 429 retreat, serial requests, no auto-resume, and private-data-free debug download after reload.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
