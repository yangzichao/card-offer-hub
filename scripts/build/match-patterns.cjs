// The supported HTTPS subset of Tampermonkey @match. A leading *. includes
// the parent domain and any subdomain, but never a lookalike suffix.
function matchPatternExpression(pattern) {
    const parsed = /^https:\/\/(\*\.)?([a-z0-9]+(?:[.-][a-z0-9]+)*)\/(\S*)$/.exec(pattern);
    if (!parsed || /[#]/.test(parsed[3])) throw new Error(`Unsupported all-in-one match pattern: ${pattern}`);
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hostname = (parsed[1] ? '(?:[a-z0-9-]+\\.)*' : '') + escape(parsed[2]);
    const path = parsed[3].split('*').map(escape).join('.*');
    return `^https://${hostname}/${path}$`;
}

module.exports = { matchPatternExpression };
