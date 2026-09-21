const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { bundleIssuerBody, bundleSharedRuntime, bundleSavedResultsReader } = require('./source-bundle.cjs');
const { buildMetadataBlock, countMetadataBlocks } = require('./userscript-metadata.cjs');
const { loadAllInOneManifest, allInOneDirectory } = require('./all-in-one-manifest.cjs');
const { matchPatternExpression } = require('./match-patterns.cjs');

function buildAllInOneBundle(scripts) {
    const manifest = loadAllInOneManifest(scripts);
    const runtimeSource = manifest.sources.map(source => readFileSync(join(allInOneDirectory, 'src', source), 'utf8').trim()).join('\n\n');
    const sharedSource = bundleSharedRuntime(scripts, manifest);
    const banks = scripts.map(script => {
        const url = script.offersUrl;
        const pageUrl = new URL(url).href.split('#')[0];
        for (const patterns of [script.matches, script.adapterMatches]) {
            if (!patterns.some(pattern => new RegExp(matchPatternExpression(pattern)).test(pageUrl))) throw new Error(`${script.id}: offersUrl must match its own bank website and adapter.`);
        }
        const bank = { id: script.id, issuer: script.issuer, label: script.bankLabel, url };
        return `{ ...${JSON.stringify(bank)}, readSavedResults: ${bundleSavedResultsReader(script, manifest.version)} }`;
    });
    const components = scripts.map(script => {
        if (!['document-start', 'document-end', 'document-idle'].includes(script.runAt)) {
            throw new Error(`Unsupported all-in-one run-at: ${script.runAt}`);
        }
        // Storage wrappers implement only these grants; reject new APIs until isolation is reviewed.
        if (script.grants.some(grant => !['GM_getValue', 'GM_setValue', 'unsafeWindow'].includes(grant))) {
            throw new Error(`${script.id}: review new grants for all-in-one storage isolation.`);
        }
        const body = bundleIssuerBody(script, manifest.version);
        const config = { id: script.id, label: script.bankLabel, offersUrl: script.offersUrl, version: manifest.version,
            entryPatterns: script.matches.map(matchPatternExpression), patterns: script.adapterMatches.map(matchPatternExpression),
            runAt: script.runAt, noFrames: script.noFrames };
        return `dispatchIssuer(${JSON.stringify(config)}, function (GM_getValue, GM_setValue) {\n// --- Issuer body: ${script.id} ---\n${body}// --- End issuer body: ${script.id} ---\n});`;
    });
    const header = buildMetadataBlock(manifest).replace('bundles/all/src', 'bundles/all and issuers');
    const output = `${header}\n(function () {\n'use strict';\n// --- Shared runtime ---\n${sharedSource}\n// --- End shared runtime ---\nconst HUB_BANKS = [${banks.join(',\n')}];\n${runtimeSource}\n\n// --- Issuer dispatches ---\n${components.join('\n\n')}\n})();\n`;
    new Script(output, { filename: `${manifest.id}.user.js` });
    if (countMetadataBlocks(output) !== 1) throw new Error('The published userscript must have exactly one metadata block.');
    return output;
}

module.exports = { buildAllInOneBundle, matchPatternExpression };
