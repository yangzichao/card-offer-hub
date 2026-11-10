// Answers like a real GraphQL server: only the fields the query selects come
// back. Without this, synthetic offers carried fields the script never asked
// for, and the 1.9.0 query that left out the reward amounts still passed.
function tokenizeQuery(query) {
    return query.replace(/#.*/g, '').match(/\.\.\.|[A-Za-z_][A-Za-z0-9_]*|[{}():$!,=\[\]]|"[^"]*"|-?\d+(?:\.\d+)?/g) || [];
}
function parseSelectionSet(tokens, index) {
    const selection = {};
    index++;
    while (tokens[index] !== '}') {
        if (index >= tokens.length) throw new Error('Unbalanced GraphQL selection.');
        if (tokens[index] === '...') throw new Error('GraphQL fragments are not used by this script.');
        let field = tokens[index++];
        if (tokens[index] === ':') { field = tokens[index + 1]; index += 2; }
        if (tokens[index] === '(') {
            let depth = 0;
            do {
                if (tokens[index] === '(') depth++;
                else if (tokens[index] === ')') depth--;
                index++;
            } while (depth);
        }
        if (tokens[index] === '{') {
            const [child, next] = parseSelectionSet(tokens, index);
            selection[field] = child;
            index = next;
        } else selection[field] = true;
    }
    return [selection, index + 1];
}
function graphqlSelection(query) {
    const tokens = tokenizeQuery(query);
    return parseSelectionSet(tokens, tokens.indexOf('{'))[0];
}
function keepSelectedFields(value, selection) {
    if (selection === true || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => keepSelectedFields(item, selection));
    const kept = {};
    for (const [field, child] of Object.entries(selection)) if (field in value) kept[field] = keepSelectedFields(value[field], child);
    return kept;
}
function answerSelectedFields(payload, query) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') return payload;
    return { ...payload, data: keepSelectedFields(payload.data, graphqlSelection(query)) };
}
module.exports = { graphqlSelection, keepSelectedFields, answerSelectedFields };
