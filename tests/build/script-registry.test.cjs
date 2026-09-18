const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { loadScriptRegistry, readScriptManifest, manifestFileName } = require('../../scripts/build/script-registry.cjs');

const VALID_MANIFEST = {
    id: 'demo-script',
    name: 'Demo Script',
    version: '1.0.0',
    description: 'Fixture manifest for registry validation',
    author: 'Tester',
    issuer: 'demo',
    matches: ['https://example.com/*'],
    grants: [],
    connects: [],
    sharedModules: [],
    sources: ['main.js']
};

function createFixtureTool(manifestOverrides = {}, sourceFileNames = ['main.js']) {
    const toolDirectory = mkdtempSync(join(tmpdir(), 'card-offer-hub-registry-'));
    mkdirSync(join(toolDirectory, 'src'), { recursive: true });
    for (const sourceFileName of sourceFileNames) {
        const sourcePath = join(toolDirectory, 'src', sourceFileName);
        mkdirSync(join(sourcePath, '..'), { recursive: true });
        writeFileSync(sourcePath, 'const demoValue = 1;\n');
    }
    writeFileSync(join(toolDirectory, manifestFileName), JSON.stringify({ ...VALID_MANIFEST, ...manifestOverrides }, null, 4));
    return toolDirectory;
}

function withFixture(manifestOverrides, sourceFileNames, assertion) {
    const toolDirectory = createFixtureTool(manifestOverrides, sourceFileNames);
    try {
        assertion(toolDirectory);
    } finally {
        rmSync(toolDirectory, { recursive: true, force: true });
    }
}

test('every script in the repository has a valid manifest', () => {
    const scripts = loadScriptRegistry();
    assert.ok(scripts.length >= 1, 'at least one script should be registered');
    const identifiers = scripts.map((script) => script.id);
    assert.deepEqual(identifiers, [...new Set(identifiers)], 'script ids must be unique');
    assert.deepEqual(identifiers, [...identifiers].sort(), 'registry should be sorted by id for stable output');
});

test('a source file that is not registered fails the build', () => {
    withFixture({}, ['main.js', 'core/forgotten.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /core\/forgotten\.js.*missing from "sources"/s);
    });
});

test('a registered source file that does not exist fails the build', () => {
    withFixture({ sources: ['main.js', 'core/missing.js'] }, ['main.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /core\/missing\.js, which does not exist/);
    });
});

test('a source file listed twice fails the build', () => {
    withFixture({ sources: ['main.js', 'main.js'] }, ['main.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /lists main\.js more than once/);
    });
});

test('a version Tampermonkey cannot compare fails the build', () => {
    withFixture({ version: '4.5' }, ['main.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /"version" must be major\.minor\.patch/);
    });
});

test('an id that would not make a clean published file name fails the build', () => {
    withFixture({ id: 'Demo Script' }, ['main.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /"id" must be lowercase kebab-case/);
    });
});

test('a shared module that does not exist fails the build', () => {
    withFixture({ sharedModules: ['nowhere/missing.js'] }, ['main.js'], (toolDirectory) => {
        assert.throws(() => readScriptManifest(toolDirectory), /shared\/nowhere\/missing\.js, which does not exist/);
    });
});
