const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const { sharedDirectory } = require('./script-registry.cjs');

const BUNDLE_INDENT = '    ';
const BUILD_CONSTANT_PATTERN = /__USERSCRIPT_[A-Z_]+__/g;

// Values the build stamps into the bundle so a script never repeats its own
// identity in source. The manifest stays the single place a version is written.
function buildConstants(script, releaseVersion) {
    if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('Bank modules require the unified release version.');
    return {
        __USERSCRIPT_ID__: script.id,
        __USERSCRIPT_NAME__: script.name,
        __USERSCRIPT_VERSION__: releaseVersion
    };
}

function substituteBuildConstants(sourceText, constants, sourceLabel) {
    const substituted = sourceText.replace(BUILD_CONSTANT_PATTERN, (token) => {
        if (!(token in constants)) throw new Error(`${sourceLabel}: unknown build constant ${token}.`);
        return JSON.stringify(constants[token]);
    });
    return substituted;
}

function indentForBundle(sourceText) {
    return sourceText.split('\n').map((line) => (line.trim() ? `${BUNDLE_INDENT}${line.trimEnd()}` : '')).join('\n');
}

function readBundleSection(absolutePath, sourceLabel, constants) {
    const content = readFileSync(absolutePath, 'utf8').trim();
    // Parse each module on its own so a syntax error names the file it came from.
    new Script(content, { filename: sourceLabel });
    const withConstants = substituteBuildConstants(content, constants, sourceLabel);
    return `${BUNDLE_INDENT}// Source: ${sourceLabel}\n${indentForBundle(withConstants)}`;
}

// Bank modules are private IIFEs inside the one published userscript.
function bundleIssuerBody(script, releaseVersion) {
    const constants = buildConstants(script, releaseVersion);
    const sections = [
        ...script.sharedModules.map((sharedModule) =>
            readBundleSection(join(sharedDirectory, sharedModule), `shared/${sharedModule}`, constants)),
        ...script.sources.map((source) =>
            readBundleSection(join(script.toolDirectory, 'src', source), source, constants))
    ];
    const publishedText = `(function () {\n    'use strict';\n\n${sections.join('\n\n')}\n})();\n`;
    new Script(publishedText, { filename: `${script.id}.user.js` });
    const leftoverConstants = publishedText.match(BUILD_CONSTANT_PATTERN);
    if (leftoverConstants) throw new Error(`${script.id}: unresolved build constants ${[...new Set(leftoverConstants)].join(', ')}.`);
    return publishedText;
}

module.exports = { bundleIssuerBody, buildConstants, BUNDLE_INDENT };
