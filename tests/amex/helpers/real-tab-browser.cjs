const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// A separate empty profile avoids Playwright's default "all pages focused"
// emulation. No user browser profile, cookies or accounts are used.
async function launchRealTabBrowser(chromium) {
    const directory = mkdtempSync(join(tmpdir(), 'offer-hub-tab-test-'));
    const child = spawn(chromium.executablePath(), ['--remote-debugging-port=0', `--user-data-dir=${directory}`,
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    try {
        const endpoint = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Chromium debugging endpoint did not start')), 10000);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited: ${code}`)); });
            child.stderr.on('data', chunk => {
                const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
        });
        const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
        return { browser, context: browser.contexts()[0], close: async () => {
            const session = await browser.newBrowserCDPSession();
            await session.send('Browser.close').catch(() => {});
            await browser.close();
            if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
            rmSync(directory, { recursive: true, force: true });
        } };
    } catch (error) {
        child.kill();
        rmSync(directory, { recursive: true, force: true });
        throw error;
    }
}
module.exports = { launchRealTabBrowser };
