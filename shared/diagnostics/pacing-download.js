function hubDownloadPacingDebugLog(state, document_) {
    const snapshot = hubPacingDebugSnapshot(state);
    const file = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document_.createElement('a');
    link.href = url;
    link.download = `card-offer-hub-${snapshot.issuer}-${snapshot.exportedAt}.json`;
    document_.body.append(link);
    try { link.click(); }
    finally { link.remove(); URL.revokeObjectURL(url); }
}
