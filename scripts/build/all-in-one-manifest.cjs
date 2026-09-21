const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { projectRoot, validateSourceCoverage } = require('./script-registry.cjs');

const allInOneDirectory = join(projectRoot, 'bundles/all');

function loadAllInOneManifest(scripts) {
    for (const script of scripts) {
        if (!script.savedResultsSource) throw new Error(`${script.id}: declare savedResultsSource for offline search.`);
        if (!script.capabilities) throw new Error(`${script.id}: declare issuer capabilities.`);
    }
    const manifest = JSON.parse(readFileSync(join(allInOneDirectory, 'userscript.json'), 'utf8'));
    for (const field of ['id', 'name', 'version', 'description', 'author']) {
        if (typeof manifest[field] !== 'string' || !manifest[field].trim()) throw new Error(`All-in-one manifest needs ${field}.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw new Error('Invalid all-in-one id.');
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('All-in-one version must be major.minor.patch.');
    if (scripts.some(script => script.id === manifest.id)) throw new Error('All-in-one id conflicts with an issuer script.');
    if (!Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error('All-in-one manifest needs sources.');
    validateSourceCoverage('bundles/all/userscript.json', allInOneDirectory, manifest.sources);
    const union = field => [...new Set(scripts.flatMap(script => script[field]))];
    return { ...manifest, matches: union('matches'), grants: union('grants'), connects: union('connects'),
        runAt: 'document-start', noFrames: scripts.every(script => script.noFrames),
        toolDirectory: allInOneDirectory, toolDirectoryPath: 'bundles/all' };
}

module.exports = { loadAllInOneManifest, allInOneDirectory };
