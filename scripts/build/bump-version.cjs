#!/usr/bin/env node
// Tampermonkey only pulls an update when @version is higher than the installed
// one, so raising the manifest version is the release trigger. Usage:
//   npm run bump -- [major|minor|patch]
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { loadScriptRegistry, manifestFileName } = require('./script-registry.cjs');
const { loadAllInOneManifest } = require('./all-in-one-manifest.cjs');

const RELEASE_LEVELS = ['major', 'minor', 'patch'];

function nextVersion(currentVersion, releaseLevel) {
    const parts = currentVersion.split('.').map(Number);
    const levelIndex = RELEASE_LEVELS.indexOf(releaseLevel);
    parts[levelIndex] += 1;
    for (let index = levelIndex + 1; index < parts.length; index++) parts[index] = 0;
    return parts.join('.');
}

function main() {
    const [releaseLevel = 'patch', ...extraArguments] = process.argv.slice(2);
    if (extraArguments.length || !RELEASE_LEVELS.includes(releaseLevel)) {
        throw new Error('Usage: npm run bump -- [major|minor|patch]. Only the unified release has a version.');
    }
    const script = loadAllInOneManifest(loadScriptRegistry());

    const manifestFilePath = join(script.toolDirectory, manifestFileName);
    const manifest = JSON.parse(readFileSync(manifestFilePath, 'utf8'));
    manifest.version = nextVersion(script.version, releaseLevel);
    writeFileSync(manifestFilePath, `${JSON.stringify(manifest, null, 4)}\n`);
    console.log(`${script.id}: ${script.version} -> ${manifest.version}. Run "npm run build" and push dist/ to publish it.`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
