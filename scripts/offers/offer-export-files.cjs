const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { homedir } = require('node:os');

const EXPORT_FORMAT = 'card-offer-hub-offers';
const SUPPORTED_SCHEMA_VERSIONS = [1];
const EXPORT_FILE_PATTERN = /^card-offer-hub-offers-.*\.json$/;

function defaultExportDirectory() {
    return join(homedir(), 'Downloads');
}

// Export file names carry an ISO timestamp, so the newest sorts last by name.
function findLatestExport(directory = defaultExportDirectory()) {
    const absoluteDirectory = resolve(directory);
    const candidates = readdirSync(absoluteDirectory)
        .filter(name => EXPORT_FILE_PATTERN.test(name) && statSync(join(absoluteDirectory, name)).isFile())
        .sort();
    if (!candidates.length) {
        throw new Error(`No Card Offer Hub export found in ${absoluteDirectory}. Open Search all banks in the userscript panel and click Export all.`);
    }
    return join(absoluteDirectory, candidates[candidates.length - 1]);
}

function loadOfferExport(filePath) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(filePath, 'utf8')); }
    catch (error) { throw new Error(`${filePath} is not readable JSON: ${error.message}`); }
    if (parsed?.format !== EXPORT_FORMAT || !SUPPORTED_SCHEMA_VERSIONS.includes(parsed.schemaVersion)
        || !Array.isArray(parsed.offers) || !Array.isArray(parsed.coverage)) {
        throw new Error(`${filePath} is not a supported Card Offer Hub export (format ${EXPORT_FORMAT}, schema ${SUPPORTED_SCHEMA_VERSIONS.join('/')}).`);
    }
    return parsed;
}

module.exports = { defaultExportDirectory, findLatestExport, loadOfferExport, EXPORT_FORMAT };
