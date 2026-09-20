#!/usr/bin/env node
// Builds the single userscript into dist/, the folder Tampermonkey
// fetches from. Usage:
//   node scripts/build/build-userscripts.cjs              rebuild dist/
//   node scripts/build/build-userscripts.cjs --check      fail if dist/ is stale
const { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { loadScriptRegistry, projectRoot } = require('./script-registry.cjs');
const { buildPublishIndex } = require('./publish-index.cjs');
const { replaceCatalog } = require('./readme-catalog.cjs');
const { REPOSITORY, publishedUserscriptFileName } = require('./repository.cjs');
const { loadAllInOneManifest } = require('./all-in-one-manifest.cjs');
const { buildAllInOneBundle } = require('./all-in-one-bundle.cjs');

const distDirectory = resolve(projectRoot, REPOSITORY.publishDirectory);
const readmePath = resolve(projectRoot, 'README.md');
const indexFileName = 'index.json';

function parseArguments(argv) {
    if (argv.some(argument => argument !== '--check')) {
        throw new Error('Only the unified userscript is published. Use npm run build or npm run check; --script is no longer supported.');
    }
    return { checkOnly: argv.includes('--check') };
}

// A file left in dist/ by a renamed or deleted script would keep serving old code
// to anyone whose Tampermonkey still points at it, so the build reports it.
function findOrphanedPublishedFiles(allScripts) {
    if (!existsSync(distDirectory)) return [];
    const expected = new Set([indexFileName, publishedUserscriptFileName(loadAllInOneManifest(allScripts).id)]);
    return readdirSync(distDirectory).filter((fileName) => !expected.has(fileName));
}

function main() {
    const { checkOnly } = parseArguments(process.argv.slice(2));
    const allScripts = loadScriptRegistry();
    const combined = loadAllInOneManifest(allScripts);
    const outputs = new Map();
    outputs.set(join(distDirectory, publishedUserscriptFileName(combined.id)), buildAllInOneBundle(allScripts));
    outputs.set(join(distDirectory, indexFileName), buildPublishIndex(allScripts));
    outputs.set(readmePath, replaceCatalog(readFileSync(readmePath, 'utf8'), allScripts));
    const orphans = findOrphanedPublishedFiles(allScripts);

    if (checkOnly) {
        const staleFiles = [...outputs].filter(([outputPath, expectedText]) =>
            !existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== expectedText);
        const problems = [
            ...staleFiles.map(([outputPath]) => `stale: ${resolve(outputPath).replace(`${projectRoot}/`, '')}`),
            ...orphans.map((fileName) => `orphaned: ${REPOSITORY.publishDirectory}/${fileName}`)
        ];
        if (problems.length) {
            throw new Error(`Published output is out of date. Run "npm run build".\n  ${problems.join('\n  ')}`);
        }
        console.log(`Checked one userscript with ${allScripts.length} bank modules: sources parse and published output is in sync.`);
        return;
    }

    mkdirSync(distDirectory, { recursive: true });
    for (const [outputPath, text] of outputs) writeFileSync(outputPath, text);
    for (const fileName of orphans) {
        rmSync(join(distDirectory, fileName), { recursive: true, force: true });
        console.log(`Removed orphaned ${REPOSITORY.publishDirectory}/${fileName}.`);
    }
    console.log(`Built ${combined.id} ${combined.version} with ${allScripts.length} issuer tools.`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
