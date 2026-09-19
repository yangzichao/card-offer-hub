function decorateHubPanel(shadowRoot, version) {
    const header = shadowRoot.querySelector('header');
    const title = header.querySelector('h2');
    const heading = document.createElement('div');
    heading.className = 'hub-heading';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'hub-eyebrow';
    eyebrow.textContent = 'Card Offer Hub';
    header.insertBefore(heading, title);
    heading.append(eyebrow, title);
    const release = document.createElement('span');
    release.className = 'hub-version';
    release.textContent = `v${version}`;
    heading.append(release);
}
