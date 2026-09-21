const { Given, When } = require('@cucumber/cucumber');

Given('I loaded offers and selected only card A', async function () {
    await this.fixture.selectCard();
    this.loadedRequestCount = this.fixture.requests.length;
    this.requestCheckpoint = this.fixture.requests.length;
});

When('I click {string}', async function (name) {
    await this.fixture.page.getByRole('button', { name, exact: true }).click();
});

When('the operation reports {string}', async function (message) {
    const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.fixture.advanceUntil(new RegExp(escaped), 1000);
});

When('one minute passes without a click', async function () {
    await this.fixture.page.clock.runFor(60000);
});

When('I reload the page', async function () {
    this.requestCheckpoint = this.fixture.requests.length;
    await this.fixture.page.reload();
    await this.fixture.page.addScriptTag({ content: this.fixture.script });
});

When('I search for {string}', async function (query) {
    await this.fixture.page.getByRole('searchbox', { name: 'Search saved offers' }).fill(query);
});
