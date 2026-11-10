// The offer list opens on To add. Tests that check every saved row switch to All.
async function showAllOffers(page) {
    const all = page.getByRole('radio', { name: /^Show all offers/ });
    if (await all.count()) await all.check();
}
module.exports = { showAllOffers };
