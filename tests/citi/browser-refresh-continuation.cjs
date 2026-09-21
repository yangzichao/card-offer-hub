const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { fixture } = require('./helpers/browser-fixture.cjs');

const outputDirectory = resolve(__dirname, '../../work/browser');
mkdirSync(outputDirectory, { recursive: true });
const refreshName = 'Refresh & add offers';
const savedName = 'Add saved offers';

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
        assert.equal(await page.getByRole('button', { name: 'Load cards & offers', exact: true }).isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: savedName, exact: true }).count(), 0);
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
        const add = page.getByRole('button', { name: savedName, exact: true });
        assert.equal(await add.isEnabled(), true, 'saved choices can continue without a separate detect or scan click');
        assert.equal(await page.locator('#hub-action-reason').isVisible(), false, 'ready state needs no repeated continuation instructions');
        await page.getByRole('searchbox').fill('');
        await page.screenshot({ path: resolve(outputDirectory, 'citi-saved-continuation.png') });
        continued.bankState.offerIds.push('new-after-cache');
        await page.getByRole('searchbox').fill('no matching offers');
        await add.click();
        await continued.advanceUntil(/Finished: 2\/2/);
        assert.deepEqual(continued.requests.slice(3).map(request => request.body), [
            {}, { accountId: 'card-a', offerId: 'a', oneClickEnroll: 'true' },
            { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
        ]);
        assert.equal(await add.isEnabled(), false, 'all saved offers are done');
        assert.equal(await page.getByRole('button', { name: refreshName, exact: true }).isEnabled(), true, 'refresh and add stays available with zero cached offers');
        const count = continued.requests.length;
        continued.bankState.cards.push('card-c');
        await page.getByRole('button', { name: refreshName, exact: true }).click();
        await continued.advanceUntil(/Finished: 1\/1/);
        assert.deepEqual(continued.requests.slice(count).map(request => request.body), [
            {}, { accountId: 'card-a' }, { accountId: 'card-b' }, { accountId: 'card-c' },
            { accountId: 'card-a', offerId: 'new-after-cache', oneClickEnroll: 'true' }
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
        await changedLogin.page.getByRole('button', { name: savedName, exact: true }).click();
        await changedLogin.advanceUntil(/do not match this login/);
        assert.equal(changedLogin.requests.length, 4);
        assert.equal(changedLogin.requests.filter(request => request.url.endsWith('/enrollMerchantOffer')).length, 0);
        assert.equal(await changedLogin.page.getByRole('checkbox', { checked: true }).count(), 0);
        assert.deepEqual(changedLogin.errors, []);
        await changedLogin.context.close();

        const unconfirmed = await fixture(browser, 'unconfirmed');
        await unconfirmed.selectCard();
        await unconfirmed.page.getByRole('button', { name: savedName, exact: true }).click();
        await unconfirmed.advanceUntil(/not explicitly confirmed/);
        await reloadSavedWorkspace(unconfirmed);
        assert.equal(await unconfirmed.page.getByRole('button', { name: savedName, exact: true }).isEnabled(), false);
        assert.match(await unconfirmed.page.locator('#hub-action-reason').innerText(), /Refresh & add offers/);
        assert.equal(await unconfirmed.page.getByRole('button', { name: refreshName, exact: true }).isEnabled(), true);
        // An unconfirmed write may have succeeded. Refresh must resolve it before adding anything else.
        unconfirmed.bankState.enrolled.add('card-a:a');
        unconfirmed.bankState.mode = 'success';
        const beforeRecovery = unconfirmed.requests.length;
        await unconfirmed.page.getByRole('button', { name: refreshName, exact: true }).click();
        await unconfirmed.advanceUntil(/Finished: 1\/1/);
        assert.deepEqual(unconfirmed.requests.slice(beforeRecovery).map(request => request.body), [
            {}, { accountId: 'card-a' }, { accountId: 'card-b' },
            { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
        ]);
        assert.deepEqual(unconfirmed.errors, []);
        await unconfirmed.context.close();
        console.log('PASS: Citi saved-only addition, one-click refresh and add with empty cache, selected-card scope, new-card opt-out, login verification, uncertain-write recovery, and no automatic requests.');
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
