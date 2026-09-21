const assert = require('node:assert/strict');
const { createBrowserStorageFixture } = require('../amex/helpers/browser-storage.cjs');

async function verifyWorkspaceReload({ page, script, id, bank, requests, activationName, documentStart = false }) {
    const search = page.getByRole('searchbox');
    if (await search.count()) await search.fill('saved query');
    const before = await page.evaluate(key => GM_getValue(key), `${id}:workspace`);
    assert.ok(before.offers.length > 0);
    const selectedBefore = before.selected;
    await page.getByRole('button', { name: `Minimize ${bank} panel`, exact: true }).click();
    const entries = await page.evaluate(id => ['workspace', 'pacing'].map(suffix => [`${id}:${suffix}`, GM_getValue(`${id}:${suffix}`, null)]), id);
    assert.equal(entries[0][1].collapsed, true);
    const storageFixture = await createBrowserStorageFixture(page, new Map(entries));
    const count = requests.length;
    if (documentStart) await page.evaluate(entries => sessionStorage.setItem('__fixtureUserscriptStorage', JSON.stringify(Object.fromEntries(entries))), entries);
    await page.reload();
    await storageFixture.restore();
    assert.equal(await page.evaluate(key => GM_getValue(key, null)?.collapsed, `${id}:workspace`), true, 'fixture restored the saved snapshot');
    if (!documentStart) await page.addScriptTag({ content: script });
    assert.equal(await page.evaluate(key => GM_getValue(key, null)?.collapsed, `${id}:workspace`), true, 'startup preserved the saved snapshot');
    await page.clock.runFor(60000);
    assert.equal(requests.length, count, 'restoration and idle time must not send requests');
    const toggle = page.getByRole('button', { name: `Expand ${bank} panel`, exact: true });
    assert.equal(await toggle.isVisible(), true, 'collapsed state restores on a new document');
    await toggle.click();
    assert.match(await page.getByRole('status').innerText(), /Saved results and selections restored/);
    assert.equal(await page.getByRole('button', { name: activationName, exact: true, includeHidden: true }).isEnabled(), false);
    assert.match(await page.locator('#workspace-cache, .workspace-cache').innerText(), /Last complete scan/);
    if (await search.count()) {
        assert.equal(await search.inputValue(), 'saved query');
        await search.fill('');
    }
    const visibleOffers = before.accounts.length ? before.offers.filter(offer => selectedBefore.includes(offer.accountId)) : before.offers;
    assert.equal(await page.locator('.offer').count(), visibleOffers.length);
    const expectedChecked = selectedBefore.length + Number(before.consent);
    assert.equal(await page.getByRole('checkbox', { checked: true }).count(), expectedChecked);
    // An actual UI deselection must survive another restoration too.
    if (expectedChecked) {
        const selectedName = await page.getByRole('checkbox', { checked: true }).first().getAttribute('aria-label');
        await page.getByRole('checkbox', { name: selectedName, exact: true }).uncheck();
        await storageFixture.flush();
        const saved = storageFixture.storage.get(`${id}:workspace`);
        assert.equal(saved.selected.length + Number(saved.consent), expectedChecked - 1);
        await page.getByRole('checkbox', { name: selectedName, exact: true }).check();
        await storageFixture.flush();
    }
}
module.exports = { verifyWorkspaceReload };
