const assert = require('node:assert/strict');
const { Then } = require('@cucumber/cucumber');

function enrollments(fixture) {
    return fixture.requests.filter(request => request.url.endsWith('/enrollMerchantOffer'));
}

Then('the {string} button is enabled', async function (name) {
    assert.equal(await this.fixture.page.getByRole('button', { name, exact: true }).isEnabled(), true);
});
Then('the {string} button is disabled', async function (name) {
    assert.equal(await this.fixture.page.getByRole('button', { name, exact: true }).isEnabled(), false);
});
Then('the saved-offers button shows {int} available offers', async function (count) {
    const button = this.fixture.page.getByRole('button', { name: 'Add saved offers', exact: true });
    assert.ok((await button.innerText()).includes(`(${count})`));
});
Then('no Citi requests have been sent', function () {
    assert.equal(this.fixture.requests.length, 0);
});
Then('no new Citi requests have been sent', function () {
    assert.equal(this.fixture.requests.length, this.requestCheckpoint);
});
Then('no enrollment requests have been sent', function () {
    assert.equal(enrollments(this.fixture).length, 0);
});
Then('exactly {int} enrollment request has been sent', function (count) {
    assert.equal(enrollments(this.fixture).length, count);
});
Then('the enrollment requests are exactly', function (table) {
    assert.deepEqual(enrollments(this.fixture).map(request => ({
        card: request.body.accountId, offer: request.body.offerId
    })), table.hashes());
});
Then('no card offer lists were fetched after loading', function () {
    const cardReads = this.fixture.requests.slice(this.loadedRequestCount)
        .filter(request => request.url.endsWith('/retrieve') && request.body.accountId);
    assert.deepEqual(cardReads, []);
});
Then('the disabled-action explanation contains {string}', async function (message) {
    const explanation = this.fixture.page.locator('#hub-action-reason');
    assert.equal(await explanation.isVisible(), true);
    assert.ok((await explanation.innerText()).includes(message));
});
Then('no disabled-action explanation is visible', async function () {
    assert.equal(await this.fixture.page.locator('#hub-action-reason').isVisible(), false);
});
