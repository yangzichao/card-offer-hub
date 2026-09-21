const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { bundleIssuerBody } = require('../../scripts/build/source-bundle.cjs');
const { buildPublishIndex } = require('../../scripts/build/publish-index.cjs');
const { replaceCatalog } = require('../../scripts/build/readme-catalog.cjs');
const { REPOSITORY, publishedFileUrl, publishedUserscriptFileName } = require('../../scripts/build/repository.cjs');
const { loadAllInOneManifest } = require('../../scripts/build/all-in-one-manifest.cjs');

const { readPublishedIssuerBody } = require('../helpers/published-issuer-source.cjs');
const scripts = loadScriptRegistry();
const manifest = loadAllInOneManifest(scripts);
const distDirectory = resolve(projectRoot, REPOSITORY.publishDirectory);

function readPublishedScript(script) {
    const publishedPath = resolve(distDirectory, publishedUserscriptFileName(script.id));
    assert.ok(existsSync(publishedPath), `${REPOSITORY.publishDirectory}/${publishedUserscriptFileName(script.id)} is missing. Run npm run build.`);
    return readFileSync(publishedPath, 'utf8');
}

function metadataValues(publishedText, key) {
    return publishedText.slice(0, publishedText.indexOf('// ==/UserScript=='))
        .split('\n')
        .map((line) => line.match(new RegExp(`^// @${key}\\s+(.+)$`)))
        .filter(Boolean)
        .map((match) => match[1].trim());
}

for (const script of scripts) {
    test(`${script.id}: the shipped module matches its sources and unified version`, () => {
        const body = readPublishedIssuerBody(script.id);
        assert.equal(body, bundleIssuerBody(script, manifest.version));
        assert.equal(body.match(/__USERSCRIPT_[A-Z_]+__/g), null);
        assert.ok(body.includes(`version: ${JSON.stringify(manifest.version)}`));
        assert.equal(Object.hasOwn(JSON.parse(readFileSync(resolve(projectRoot, script.manifestPath))), 'version'), false);
    });
}

test('the only published script has one metadata block and a stable update identity', () => {
    const publishedText = readPublishedScript(manifest);
    const installUrl = publishedFileUrl(publishedUserscriptFileName(manifest.id));
    assert.deepEqual(metadataValues(publishedText, 'updateURL'), [installUrl]);
    assert.deepEqual(metadataValues(publishedText, 'downloadURL'), [installUrl]);
    assert.deepEqual(metadataValues(publishedText, 'version'), [manifest.version]);
    assert.equal(publishedText.split('\n').filter(line => line.trim() === '// ==UserScript==').length, 1);
    assert.equal(publishedText.split('\n').filter(line => line.trim() === '// ==/UserScript==').length, 1);
});

test('the published catalog lists one install and all unversioned bank modules', () => {
    assert.equal(readFileSync(resolve(distDirectory, 'index.json'), 'utf8'), buildPublishIndex(scripts));
    const catalog = JSON.parse(readFileSync(resolve(distDirectory, 'index.json'), 'utf8'));
    assert.deepEqual(catalog.scripts.map((entry) => entry.id), [manifest.id]);
    assert.equal(catalog.schemaVersion, 2);
    assert.deepEqual(catalog.scripts[0].includes.map(entry => entry.id), scripts.map(script => script.id));
    assert.ok(catalog.scripts[0].includes.every(entry => !Object.hasOwn(entry, 'version') && !Object.hasOwn(entry, 'installUrl')));
});

test('the README install table is in sync with the registry', () => {
    const readmeText = readFileSync(resolve(projectRoot, 'README.md'), 'utf8');
    assert.equal(readmeText, replaceCatalog(readmeText, scripts), 'README.md install table is stale; run npm run build.');
});

test('dist/ holds only the catalog and unified userscript', () => {
    const expected = ['index.json', publishedUserscriptFileName(manifest.id)].sort();
    assert.deepEqual(readdirSync(distDirectory).sort(), expected,
        'a leftover file in dist/ keeps serving old code to anyone whose Tampermonkey still points at it.');
});

// A gitignore that swallows a project directory is silent: git simply never
// stages those files, the push looks fine, and the repository is left without
// the code. This has already happened twice here, both times from a pattern in
// the user's global gitignore rather than anything in this repository:
// "dist/" hid the published userscripts, and a bare "build/" hid the entire
// scripts/build/ pipeline plus these very tests. Walk the real tree instead of
// naming a few paths, so the next such pattern fails here rather than in CI.
test('no project file is excluded from version control', () => {
    const { spawnSync } = require('node:child_process');
    const { readdirSync } = require('node:fs');
    const { join, relative } = require('node:path');

    const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'work', 'analysis', 'coverage']);
    function projectFilesRecursively(directory) {
        return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.gitignore') return [];
            if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) return projectFilesRecursively(absolutePath);
            // Local captures are deliberately ignored; everything else must be tracked.
            if (entry.name.endsWith('.har')) return [];
            return [relative(projectRoot, absolutePath)];
        });
    }

    const projectFiles = projectFilesRecursively(projectRoot);
    assert.ok(projectFiles.length > 20, 'the walk should find the project, not an empty directory');
    const result = spawnSync('git', ['check-ignore', ...projectFiles], { cwd: projectRoot, encoding: 'utf8' });
    if (result.error || result.status === 128) return; // No usable git checkout; nothing to assert.
    const ignoredFiles = result.stdout.split('\n').filter(Boolean);
    assert.deepEqual(ignoredFiles, [],
        `gitignore excludes ${ignoredFiles.join(', ')}. These files would never be committed, `
        + 'and the pushed repository would be missing them. Re-include them in .gitignore.');
});
