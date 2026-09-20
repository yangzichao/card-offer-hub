const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { bundleIssuerBody } = require('./source-bundle.cjs');
const { buildMetadataBlock, countMetadataBlocks } = require('./userscript-metadata.cjs');
const { loadAllInOneManifest, allInOneDirectory } = require('./all-in-one-manifest.cjs');
const { sharedDirectory } = require('./script-registry.cjs');

// Fail closed when a future adapter needs match syntax this router does not implement.
function matchPatternExpression(pattern) {
    if (!/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(pattern)) throw new Error(`Unsupported all-in-one match pattern: ${pattern}`);
    return '^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
}

function buildAllInOneBundle(scripts) {
    const manifest = loadAllInOneManifest(scripts);
    const runtimeSource = manifest.sources.map(source => readFileSync(join(allInOneDirectory, 'src', source), 'utf8').trim()).join('\n\n');
    const designSource = readFileSync(join(sharedDirectory, 'ui/design-system.js'), 'utf8').trim();
    const banks = scripts.map(script => {
        const url = script.offersUrl || script.matches[0].replace(/\*.*$/, '');
        if (!script.matches.some(pattern => new RegExp(matchPatternExpression(pattern)).test(url))) throw new Error(`${script.id}: offersUrl must match its own bank website.`);
        return { id: script.id, issuer: script.issuer, label: script.bankLabel, url };
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
        const config = { id: script.id, patterns: script.matches.map(matchPatternExpression), runAt: script.runAt, noFrames: script.noFrames };
        return `dispatchIssuer(${JSON.stringify(config)}, function (GM_getValue, GM_setValue) {\n// --- Issuer body: ${script.id} ---\n${body}// --- End issuer body: ${script.id} ---\n});`;
    });
    const header = buildMetadataBlock(manifest).replace('bundles/all/src', 'bundles/all and issuers');
    const output = `${header}\n(function () {\n'use strict';\nconst HUB_BANKS = ${JSON.stringify(banks)};\n${designSource}\n${runtimeSource}\n\n// --- Issuer dispatches ---\n${components.join('\n\n')}\n})();\n`;
    new Script(output, { filename: `${manifest.id}.user.js` });
    if (countMetadataBlocks(output) !== 1) throw new Error('The published userscript must have exactly one metadata block.');
    return output;
}

module.exports = { buildAllInOneBundle, matchPatternExpression };
