const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { bundleUserscript } = require('./source-bundle.cjs');
const { buildMetadataBlock } = require('./userscript-metadata.cjs');
const { loadAllInOneManifest, allInOneDirectory } = require('./all-in-one-manifest.cjs');

// Fail closed when a future adapter needs match syntax this router does not implement.
function matchPatternExpression(pattern) {
    if (!/^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(pattern)) throw new Error(`Unsupported all-in-one match pattern: ${pattern}`);
    return '^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
}

function buildAllInOneBundle(scripts) {
    const manifest = loadAllInOneManifest(scripts);
    const dispatchSource = readFileSync(join(allInOneDirectory, 'dispatch.js'), 'utf8').trim();
    const components = scripts.map(script => {
        if (!['document-start', 'document-end', 'document-idle'].includes(script.runAt)) {
            throw new Error(`Unsupported all-in-one run-at: ${script.runAt}`);
        }
        // Storage wrappers implement only these grants; reject new APIs until isolation is reviewed.
        if (script.grants.some(grant => !['GM_getValue', 'GM_setValue', 'unsafeWindow'].includes(grant))) {
            throw new Error(`${script.id}: review new grants for all-in-one storage isolation.`);
        }
        const standalone = bundleUserscript(script);
        const body = standalone.slice(standalone.indexOf('(function () {'));
        const config = { id: script.id, patterns: script.matches.map(matchPatternExpression), runAt: script.runAt, noFrames: script.noFrames };
        return `dispatchIssuer(${JSON.stringify(config)}, function (GM_getValue, GM_setValue) {\n${body}});`;
    });
    const header = buildMetadataBlock(manifest).replace('bundles/all/src', 'bundles/all and issuers');
    const output = `${header}\n(function () {\n'use strict';\n${dispatchSource}\n\n${components.join('\n\n')}\n})();\n`;
    new Script(output, { filename: `${manifest.id}.user.js` });
    return output;
}

module.exports = { buildAllInOneBundle, matchPatternExpression };
