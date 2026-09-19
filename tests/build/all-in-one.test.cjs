const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, cpSync, mkdtempSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { runInNewContext } = require('node:vm');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { loadAllInOneManifest } = require('../../scripts/build/all-in-one-manifest.cjs');
const { buildAllInOneBundle, matchPatternExpression } = require('../../scripts/build/all-in-one-bundle.cjs');
const { bundleUserscript } = require('../../scripts/build/source-bundle.cjs');
const { publishedFileUrl } = require('../../scripts/build/repository.cjs');

const scripts = loadScriptRegistry();
const manifest = loadAllInOneManifest(scripts);
const published = readFileSync(resolve(projectRoot, `dist/${manifest.id}.user.js`), 'utf8');
function metadata(key) {
    return [...published.matchAll(new RegExp(`^// @${key}\\s+(.+)$`, 'gm'))].map(match => match[1]);
}

test('all-in-one embeds every exact issuer body with a single install and update identity', () => {
    assert.equal(published, buildAllInOneBundle(scripts));
    assert.equal(published.split('// ==UserScript==').length - 1, 1);
    assert.deepEqual(metadata('version'), [manifest.version]);
    assert.deepEqual(metadata('updateURL'), [publishedFileUrl(`${manifest.id}.user.js`)]);
    assert.deepEqual(metadata('downloadURL'), metadata('updateURL'));
    assert.deepEqual(metadata('match'), manifest.matches);
    assert.deepEqual(metadata('grant'), manifest.grants);
    assert.deepEqual(metadata('run-at'), ['document-start']);
    for (const script of scripts) {
        const standalone = bundleUserscript(script);
        assert.ok(published.includes(standalone.slice(standalone.indexOf('(function () {'))), script.id);
    }
});

// Replace the already-verified issuer bodies with probes to isolate routing,
// timing, frame boundaries and storage collisions without mocking issuer APIs.
function probe(url, readyState = 'loading', inFrame = false) {
    let source = published;
    for (const script of scripts) {
        const standalone = bundleUserscript(script);
        source = source.replace(standalone.slice(standalone.indexOf('(function () {')),
            `started.push(${JSON.stringify(script.id)}); GM_setValue('shared-key', ${JSON.stringify(script.id)}); reads.push(GM_getValue('shared-key'));`);
    }
    const callbacks = [], started = [], reads = [], stored = new Map();
    const window = {};
    window.self = window;
    window.top = inFrame ? {} : window;
    const context = { location: new URL(url), window, started, reads,
        document: { readyState, addEventListener: (event, callback) => { assert.equal(event, 'DOMContentLoaded'); callbacks.push(callback); } },
        GM_getValue: (key, fallback) => stored.get(key) ?? fallback,
        GM_setValue: (key, value) => stored.set(key, value) };
    const inject = () => runInNewContext(source, context);
    inject();
    return { started, reads, stored, inject, ready: () => callbacks.forEach(callback => callback()) };
}

test('routing selects only the correct issuer and preserves document-start vs DOM-ready startup', () => {
    for (const script of scripts) {
        for (const match of script.matches) {
            const result = probe(match.replaceAll('*', 'sample'));
            assert.deepEqual(result.started, script.runAt === 'document-start' ? [script.id] : []);
            result.ready();
            assert.deepEqual(result.started, [script.id]);
            assert.deepEqual(result.reads, [script.id]);
            assert.deepEqual([...result.stored.keys()], [`issuer:${script.id}:shared-key`]);
            result.inject();
            result.ready();
            assert.deepEqual(result.started, [script.id], 'repeated injection must not install twice');
            assert.deepEqual(probe(match.replaceAll('*', 'sample'), 'complete').started, [script.id]);
            const framed = probe(match.replaceAll('*', 'sample'), 'complete', true);
            assert.deepEqual(framed.started, []);
        }
    }
});

test('unrelated sites, misleading hostnames and unmatched bank paths do nothing', () => {
    for (const url of ['https://example.com/', 'https://secure.chase.com.evil.example/web/auth/home',
        'https://secure.chase.com/public/', 'http://global.americanexpress.com/',
        'https://web.secure.wellsfargo.com/auth/login', 'https://online.citi.com/other/']) {
        const result = probe(url, 'complete');
        assert.deepEqual(result.started, [], url);
        assert.equal(result.stored.size, 0);
    }
    assert.throws(() => matchPatternExpression('*://*.example.com/*'), /Unsupported/);
});

test('issuer releases automatically bump all-in-one and targeted builds keep it current', () => {
    const directory = mkdtempSync(join(tmpdir(), 'card-offer-hub-release-'));
    try {
        for (const entry of ['scripts', 'issuers', 'shared', 'bundles', 'README.md']) {
            cpSync(join(projectRoot, entry), join(directory, entry), { recursive: true });
        }
        const run = (...args) => execFileSync(process.execPath, args, { cwd: directory, stdio: 'pipe' });
        run('scripts/build/bump-version.cjs', scripts[0].id, 'patch');
        const updated = JSON.parse(readFileSync(join(directory, 'bundles/all/userscript.json')));
        const expected = manifest.version.split('.').map(Number);
        expected[2]++;
        assert.equal(updated.version, expected.join('.'));
        run('scripts/build/build-userscripts.cjs', '--script', scripts[0].id);
        run('scripts/build/build-userscripts.cjs', '--script', manifest.id, '--check');
        const catalog = JSON.parse(readFileSync(join(directory, 'dist/index.json')));
        assert.equal(catalog.allInOne.version, updated.version);
        run('scripts/build/bump-version.cjs', manifest.id, 'minor');
        const wrapperRelease = JSON.parse(readFileSync(join(directory, 'bundles/all/userscript.json')));
        assert.equal(wrapperRelease.version, `${expected[0]}.${expected[1] + 1}.0`);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
