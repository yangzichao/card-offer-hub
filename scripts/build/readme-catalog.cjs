const { publishedFileUrl, publishedUserscriptFileName } = require('./repository.cjs');
const { loadAllInOneManifest } = require('./all-in-one-manifest.cjs');

const CATALOG_START_MARKER = '<!-- published-scripts:start -->';
const CATALOG_END_MARKER = '<!-- published-scripts:end -->';

// The install table in README.md is generated so a new script shows up for users
// the moment it is built, instead of waiting for someone to remember the README.
function buildCatalogTable(scripts) {
    const combined = loadAllInOneManifest(scripts);
    const rows = scripts.map((script) => {
        return `| [${script.bankLabel}](${script.toolDirectoryPath}/README.md) | ${script.matches.join('<br>')} |`;
    });
    return [
        CATALOG_START_MARKER,
        '',
        `**[安装 / 更新 Card Offer Hub ${combined.version}](${publishedFileUrl(publishedUserscriptFileName(combined.id))})** — 唯一安装包，包含下列 ${scripts.length} 家银行。`,
        '',
        '安装一次，按当前银行页面加载对应功能，所有银行共用一个发布版本。[使用说明](bundles/all/README.md)',
        '',
        '| 银行 | 生效站点 |',
        '| --- | --- |',
        ...rows,
        '',
        CATALOG_END_MARKER
    ].join('\n');
}

function replaceCatalog(readmeText, scripts) {
    const startIndex = readmeText.indexOf(CATALOG_START_MARKER);
    const endIndex = readmeText.indexOf(CATALOG_END_MARKER);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(`README.md must contain the ${CATALOG_START_MARKER} / ${CATALOG_END_MARKER} markers around the script table.`);
    }
    return readmeText.slice(0, startIndex) + buildCatalogTable(scripts) + readmeText.slice(endIndex + CATALOG_END_MARKER.length);
}

module.exports = { buildCatalogTable, replaceCatalog, CATALOG_START_MARKER, CATALOG_END_MARKER };
