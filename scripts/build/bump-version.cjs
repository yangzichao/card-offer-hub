#!/usr/bin/env node
// Tampermonkey only pulls an update when @version is higher than the installed
// one, so raising the manifest version is the release trigger. Usage:
//   node scripts/build/bump-version.cjs <script-id> [major|minor|patch]
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
    const [scriptIdentifier, releaseLevel = 'patch'] = process.argv.slice(2);
    const scripts = loadScriptRegistry();
    const combined = loadAllInOneManifest(scripts);
    const releaseTargets = [...scripts, combined];
    if (!scriptIdentifier) throw new Error(`Usage: npm run bump -- <script-id> [${RELEASE_LEVELS.join('|')}]. Known ids: ${scripts.map((script) => script.id).join(', ')}.`);
    if (!RELEASE_LEVELS.includes(releaseLevel)) throw new Error(`Release level must be one of ${RELEASE_LEVELS.join(', ')}.`);
    const script = releaseTargets.find((candidate) => candidate.id === scriptIdentifier);
    if (!script) throw new Error(`No script with id "${scriptIdentifier}". Known ids: ${scripts.map((candidate) => candidate.id).join(', ')}.`);

    const manifestFilePath = join(script.toolDirectory, manifestFileName);
    const manifest = JSON.parse(readFileSync(manifestFilePath, 'utf8'));
    manifest.version = nextVersion(script.version, releaseLevel);
    writeFileSync(manifestFilePath, `${JSON.stringify(manifest, null, 4)}\n`);
    if (script.id !== combined.id) {
        const combinedPath = join(combined.toolDirectory, manifestFileName);
        const combinedManifest = JSON.parse(readFileSync(combinedPath, 'utf8'));
        combinedManifest.version = nextVersion(combined.version, 'patch');
        writeFileSync(combinedPath, `${JSON.stringify(combinedManifest, null, 4)}\n`);
        console.log(`${combined.id}: ${combined.version} -> ${combinedManifest.version} (includes this issuer update).`);
    }
    console.log(`${script.id}: ${script.version} -> ${manifest.version}. Run "npm run build" and push dist/ to publish it.`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
