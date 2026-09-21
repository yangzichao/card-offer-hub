const { Given } = require('@cucumber/cucumber');

Given('Citi now returns only card C for the current login', function () {
    this.fixture.bankState.cards = ['card-c'];
});

Given('Citi has a new offer {string}', function (offerId) {
    this.fixture.bankState.offerIds.push(offerId);
});

Given('Citi has {int} available offers', function (count) {
    this.fixture.bankState.offerIds = Array.from({ length: count }, (_, index) => `synthetic-${index}`);
});

Given('Citi will return an unconfirmed enrollment response', function () {
    this.fixture.bankState.mode = 'unconfirmed';
});

Given('Citi will rate limit enrollment requests', function () {
    this.fixture.bankState.mode = '429';
});

Given('Citi confirms that offer {string} on card A is already enrolled', function (offerId) {
    this.fixture.bankState.enrolled.add(`card-a:${offerId}`);
    this.fixture.bankState.mode = 'success';
});

Given('I will press Stop while the first enrollment is in flight', function () {
    this.fixture.bankState.beforeEnrollmentResponse = async () => {
        this.fixture.bankState.beforeEnrollmentResponse = null;
        await this.fixture.page.getByRole('button', { name: 'Stop', exact: true }).click();
    };
});
