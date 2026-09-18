// Model the synchronous GM storage API. Values live outside the page, just as
// userscript storage does; a navigation discards every page-local variable.
async function createBrowserStorageFixture(page, storage = new Map()) {
    await page.exposeFunction('__testPersistUserscriptValue', (key, value) => {
        storage.set(key, structuredClone(value));
    });
    return {
        storage,
        async restore() {
            await page.evaluate((entries) => {
                const values = new Map(entries);
                window.__testUserscriptWrites = Promise.resolve();
                window.GM_getValue = (key, defaultValue) => structuredClone(values.get(key) ?? defaultValue);
                window.GM_setValue = (key, value) => {
                    if (window.__testStorageWriteFailure) throw new Error('Synthetic storage failure');
                    const snapshot = structuredClone(value);
                    values.set(key, snapshot);
                    window.__testUserscriptWrites = window.__testUserscriptWrites.then(() => window.__testPersistUserscriptValue(key, snapshot));
                };
                window.unsafeWindow = window;
            }, [...storage]);
        },
        async flush() {
            await page.evaluate(() => window.__testUserscriptWrites);
        }
    };
}

module.exports = { createBrowserStorageFixture };
