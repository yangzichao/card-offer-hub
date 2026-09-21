const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Read the exact bank body shipped inside the single public artifact. Tests
// never rebuild an alternative standalone script or fall back to source files.
function readPublishedIssuerBody(identifier) {
    const published = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
    const startMarker = `// --- Issuer body: ${identifier} ---\n`;
    const endMarker = `// --- End issuer body: ${identifier} ---`;
    const start = published.indexOf(startMarker);
    const end = published.indexOf(endMarker);
    if (start < 0 || end <= start || published.indexOf(startMarker, start + 1) !== -1
        || published.indexOf(endMarker, end + 1) !== -1) {
        throw new Error(`Missing or ambiguous published bank module: ${identifier}. Run npm run build.`);
    }
    return published.slice(start + startMarker.length, end);
}

function readPublishedSharedRuntime() {
    const published = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
    const startMarker = '// --- Shared runtime ---\n';
    const endMarker = '// --- End shared runtime ---';
    const start = published.indexOf(startMarker), end = published.indexOf(endMarker);
    if (start < 0 || end <= start || published.indexOf(startMarker, start + 1) !== -1) throw new Error('Missing shared runtime.');
    return published.slice(start + startMarker.length, end);
}

function readPublishedIssuerSource(identifier) {
    // Include the exact shipped dependency definitions in the existing probe scope.
    // No source compilation, alternative implementation, or standalone artifact.
    return readPublishedIssuerBody(identifier).replace("    'use strict';", "    'use strict';\n" + readPublishedSharedRuntime());
}

module.exports = { readPublishedIssuerSource, readPublishedIssuerBody, readPublishedSharedRuntime };
