const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { fixture } = require('./helpers/browser-fixture.cjs');

const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });
const refreshName = 'Refresh all cards & offers';

async function reloadSavedWorkspace(test) {
    const count = test.requests.length;
    await test.page.reload();
    await test.page.addScriptTag({ content: test.script });
    await test.page.clock.runFor(60000);
    assert.equal(test.requests.length, count, 'reload and idle time never refresh or add automatically');
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    try {
        const continued = await fixture(browser);
        const { page } = continued;
        assert.equal(await page.getByRole('button', { name: refreshName, exact: true }).isEnabled(), true);
        await continued.selectCard();
        assert.deepEqual(continued.requests.map(request => request.body), [{}, { accountId: 'card-a' }, { accountId: 'card-b' }]);
        assert.equal(await page.getByRole('checkbox', { name: 'Select Synthetic Card B', exact: true }).isChecked(), false);
        await page.getByRole('searchbox').fill('saved query');
        await page.getByRole('button', { name: 'Minimize Citi panel' }).click();
        await reloadSavedWorkspace(continued);
        await page.getByRole('button', { name: 'Expand Citi panel' }).click();
        assert.equal(await page.getByRole('searchbox').inputValue(), 'saved query');
        assert.equal(await page.getByRole('checkbox', { name: 'Select Synthetic Card A', exact: true }).isChecked(), true);
        assert.equal(await page.getByRole('checkbox', { name: 'Select Synthetic Card B', exact: true }).isChecked(), false);
        const add = page.getByRole('button', { name: 'Add all offers', exact: true });
        assert.equal(await add.isEnabled(), true, 'saved choices can continue without a separate detect or scan click');
        assert.match(await page.locator('#hub-action-reason').innerText(), /Continue with your saved card choices/);
        await page.getByRole('searchbox').fill('');
        await page.screenshot({ path: resolve(outputDirectory, 'citi-saved-continuation.png') });
        // A server-side enrollment since the saved scan must not be repeated.
        continued.bankState.enrolled.add('card-a:a');
        await page.getByRole('searchbox').fill('no matching offers');
        await add.click();
        await continued.advanceUntil(/Finished: 1\/1/);
        assert.deepEqual(continued.requests.slice(3).map(request => request.body), [
            {}, { accountId: 'card-a' }, { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
        ]);
        const count = continued.requests.length;
        continued.bankState.cards.push('card-c');
        await page.getByRole('button', { name: refreshName, exact: true }).click();
        await continued.advanceUntil(/Refresh complete: 3 cards/);
        assert.deepEqual(continued.requests.slice(count).map(request => request.body), [
            {}, { accountId: 'card-a' }, { accountId: 'card-b' }, { accountId: 'card-c' }
        ]);
        assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
        assert.equal(await page.getByRole('checkbox', { name: 'Select Synthetic Card C', exact: true }).isChecked(), false);
        assert.equal(await page.getByRole('searchbox').inputValue(), 'no matching offers');
        assert.deepEqual(continued.errors, []);
        await continued.context.close();

        const changedLogin = await fixture(browser);
        await changedLogin.selectCard();
        await reloadSavedWorkspace(changedLogin);
        changedLogin.bankState.cards = ['card-c'];
        await changedLogin.page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        await changedLogin.advanceUntil(/do not match this login/);
        assert.equal(changedLogin.requests.length, 4);
        assert.equal(changedLogin.requests.filter(request => request.url.endsWith('/enrollMerchantOffer')).length, 0);
        assert.equal(await changedLogin.page.getByRole('checkbox', { checked: true }).count(), 0);
        assert.deepEqual(changedLogin.errors, []);
        await changedLogin.context.close();

        const unconfirmed = await fixture(browser, 'unconfirmed');
        await unconfirmed.selectCard();
        await unconfirmed.page.getByRole('button', { name: 'Add all offers', exact: true }).click();
        await unconfirmed.advanceUntil(/not explicitly confirmed/);
        await reloadSavedWorkspace(unconfirmed);
        assert.equal(await unconfirmed.page.getByRole('button', { name: 'Add all offers', exact: true }).isEnabled(), false);
        assert.match(await unconfirmed.page.locator('#hub-action-reason').innerText(), /Refresh all cards & offers/);
        assert.equal(await unconfirmed.page.getByRole('button', { name: refreshName, exact: true }).isEnabled(), true);
        assert.deepEqual(unconfirmed.errors, []);
        await unconfirmed.context.close();
        console.log('PASS: Citi one-click all-card refresh, saved choices and opt-outs, reload continuation, current-login verification, no duplicate enrollment, unconfirmed recovery and no automatic requests.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
