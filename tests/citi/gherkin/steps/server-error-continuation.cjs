const assert = require('node:assert/strict');
const { Given, Then } = require('@cucumber/cucumber');

Given('only the first Citi enrollment returns HTTP 500', function () {
    this.fixture.bankState.mode = 'server-error-once';
});
Given('Citi returns HTTP 500 for every enrollment', function () {
    this.fixture.bankState.mode = 'server-error';
});
Given('Citi enrollment service has recovered', function () {
    this.fixture.bankState.mode = 'success';
});
Then('the operation status appears below the action buttons and above the offers', async function () {
    const page = this.fixture.page;
    const actions = await page.locator('.hub-primary-actions').boundingBox();
    const status = await page.getByRole('status').boundingBox();
    const offers = await page.locator('#offers').boundingBox();
    assert.ok(actions && status && offers);
    assert.ok(status.y >= actions.y + actions.height);
    assert.ok(status.y + status.height <= offers.y);
    assert.equal(await page.getByRole('status').isVisible(), true);
});
