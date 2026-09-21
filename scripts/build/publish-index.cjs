const { repositoryUrl, publishedFileUrl, publishedUserscriptFileName, REPOSITORY } = require('./repository.cjs');
const { loadAllInOneManifest } = require('./all-in-one-manifest.cjs');

// One install/update identity. Included bank modules have no independent releases.
function buildPublishIndex(scripts) {
    const combined = loadAllInOneManifest(scripts);
    const fileName = publishedUserscriptFileName(combined.id);
    const installUrl = publishedFileUrl(fileName);
    return `${JSON.stringify({
        schemaVersion: 2,
        repository: repositoryUrl(),
        publishBranch: REPOSITORY.publishBranch,
        scripts: [{
            id: combined.id, name: combined.name, version: combined.version,
            description: combined.description, matches: combined.matches,
            publishedFile: `${REPOSITORY.publishDirectory}/${fileName}`,
            installUrl, updateUrl: installUrl,
            includes: scripts.map(script => ({
                id: script.id, name: script.name, issuer: script.issuer,
                matches: script.matches, adapterMatches: script.adapterMatches, offersUrl: script.offersUrl,
                sourceDirectory: script.toolDirectoryPath
            }))
        }]
    }, null, 4)}\n`;
}

module.exports = { buildPublishIndex };
