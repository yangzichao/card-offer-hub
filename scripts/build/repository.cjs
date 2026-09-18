// Publication identity for every generated userscript.
//
// These values are baked into the @updateURL and @downloadURL of each published
// file, so Tampermonkey keeps checking the same addresses after installation.
// Changing them only affects scripts installed from the new build; anything
// already installed keeps polling the old address until it updates once more.
const REPOSITORY = Object.freeze({
    owner: 'yangzichao',
    name: 'card-offer-hub',
    publishBranch: 'main',
    publishDirectory: 'dist'
});

function repositoryUrl() {
    return `https://github.com/${REPOSITORY.owner}/${REPOSITORY.name}`;
}

function issuesUrl() {
    return `${repositoryUrl()}/issues`;
}

function sourceBrowseUrl(repositoryRelativePath) {
    return `${repositoryUrl()}/blob/${REPOSITORY.publishBranch}/${repositoryRelativePath}`;
}

// Raw file addresses are what Tampermonkey fetches. They serve the branch tip,
// so pushing a rebuilt dist/ to the publish branch is the whole release step.
function publishedFileUrl(publishedFileName) {
    return `https://raw.githubusercontent.com/${REPOSITORY.owner}/${REPOSITORY.name}`
        + `/${REPOSITORY.publishBranch}/${REPOSITORY.publishDirectory}/${publishedFileName}`;
}

function publishedUserscriptFileName(scriptIdentifier) {
    return `${scriptIdentifier}.user.js`;
}

module.exports = {
    REPOSITORY,
    repositoryUrl,
    issuesUrl,
    sourceBrowseUrl,
    publishedFileUrl,
    publishedUserscriptFileName
};
