const assert = require('node:assert/strict');
const { BeforeAll, AfterAll, After, Given, setDefaultTimeout, Status } = require('@cucumber/cucumber');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { fixture } = require('../../helpers/browser-fixture.cjs');

let browser;
setDefaultTimeout(30000);
BeforeAll(async () => { browser = await chromium.launch({ headless: true }); });
AfterAll(async () => { await browser?.close(); });

Given('a synthetic Citi page with the published userscript', async function () {
    this.fixture = await fixture(browser);
    this.requestCheckpoint = 0;
    this.loadedRequestCount = 0;
});

After(async function ({ result }) {
    if (!this.fixture) return;
    try {
        if (result?.status === Status.FAILED) {
            await this.attach(await this.fixture.page.screenshot(), 'image/png');
        }
        assert.deepEqual(this.fixture.errors, [], 'no browser errors or unexpected network destinations');
        assert.ok(this.fixture.maximumActive() <= 1, 'Citi requests remain serial');
    } finally {
        await this.fixture.context.close();
    }
});
