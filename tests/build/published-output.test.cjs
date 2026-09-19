const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { loadScriptRegistry, projectRoot } = require('../../scripts/build/script-registry.cjs');
const { bundleUserscript } = require('../../scripts/build/source-bundle.cjs');
const { buildPublishIndex } = require('../../scripts/build/publish-index.cjs');
const { replaceCatalog } = require('../../scripts/build/readme-catalog.cjs');
const { REPOSITORY, publishedFileUrl, publishedUserscriptFileName } = require('../../scripts/build/repository.cjs');
const { loadAllInOneManifest } = require('../../scripts/build/all-in-one-manifest.cjs');

const scripts = loadScriptRegistry();
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
    test(`${script.id}: the published file matches the current sources`, () => {
        assert.equal(readPublishedScript(script), bundleUserscript(script),
            'dist/ is stale; run npm run build and commit the result.');
    });

    test(`${script.id}: Tampermonkey can update it from this repository`, () => {
        const publishedText = readPublishedScript(script);
        const installUrl = publishedFileUrl(publishedUserscriptFileName(script.id));
        assert.deepEqual(metadataValues(publishedText, 'updateURL'), [installUrl]);
        assert.deepEqual(metadataValues(publishedText, 'downloadURL'), [installUrl]);
        assert.deepEqual(metadataValues(publishedText, 'version'), [script.version],
            'the published @version must match userscript.json, or updates will not be offered.');
    });

    test(`${script.id}: the published file has exactly one metadata block`, () => {
        const publishedText = readPublishedScript(script);
        assert.equal(publishedText.split('\n').filter((line) => line.trim() === '// ==UserScript==').length, 1);
        assert.equal(publishedText.split('\n').filter((line) => line.trim() === '// ==/UserScript==').length, 1);
    });

    test(`${script.id}: no build constant is left unresolved`, () => {
        assert.equal(readPublishedScript(script).match(/__USERSCRIPT_[A-Z_]+__/g), null);
    });

    test(`${script.id}: the runtime version matches the metadata version`, () => {
        assert.ok(readPublishedScript(script).includes(`version: ${JSON.stringify(script.version)}`),
            'the bundled SETTINGS.version should come from the manifest, not a second hand-edited copy.');
    });
}

test('the published catalog lists every script exactly once', () => {
    assert.equal(readFileSync(resolve(distDirectory, 'index.json'), 'utf8'), buildPublishIndex(scripts));
    const catalog = JSON.parse(readFileSync(resolve(distDirectory, 'index.json'), 'utf8'));
    assert.deepEqual(catalog.scripts.map((entry) => entry.id), scripts.map((script) => script.id));
});

test('the README install table is in sync with the registry', () => {
    const readmeText = readFileSync(resolve(projectRoot, 'README.md'), 'utf8');
    assert.equal(readmeText, replaceCatalog(readmeText, scripts), 'README.md install table is stale; run npm run build.');
});

test('dist/ holds nothing but the catalog, issuer scripts and all-in-one', () => {
    const expected = ['index.json', ...[...scripts, loadAllInOneManifest(scripts)].map((script) => publishedUserscriptFileName(script.id))].sort();
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
