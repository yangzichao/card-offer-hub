const { Given } = require('@cucumber/cucumber');

Given('I loaded saved offers with masked card names', async function () {
    this.fixture.bankState.cardNames = { 'card-a': 'Synthetic Card A - 1234', 'card-b': 'Synthetic Card B - 5678' };
    await this.fixture.page.getByRole('button', { name: 'Load cards & offers', exact: true }).click();
    await this.fixture.advanceUntil(/Loaded 2 cards/);
    await this.fixture.page.getByRole('checkbox', { name: 'Select Synthetic Card B - 5678', exact: true }).uncheck();
    this.loadedRequestCount = this.fixture.requests.length;
    this.requestCheckpoint = this.fixture.requests.length;
});
Given('Citi changes the card request identifiers', function () {
    this.fixture.bankState.cards = ['renewed-a', 'renewed-b'];
    this.fixture.bankState.cardNames = { 'renewed-a': 'Synthetic Card A - 1234', 'renewed-b': 'Synthetic Card B - 5678' };
});
Given('Citi temporarily rejects the login', function () { this.fixture.bankState.mode = '401'; });
Given('Citi accepts the login again', function () { this.fixture.bankState.mode = 'success'; });
