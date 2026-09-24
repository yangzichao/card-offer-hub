function decorateHubPanel(shadowRoot, version) {
    const header = shadowRoot.querySelector('header');
    const title = header.querySelector('h2');
    const mark = document.createElement('span');
    mark.className = 'hub-mark';
    mark.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('div');
    heading.className = 'hub-heading';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'hub-eyebrow';
    eyebrow.textContent = 'Card Offer Hub';
    const release = document.createElement('span');
    release.className = 'hub-version';
    release.textContent = `v${version}`;
    const update = document.createElement('a');
    update.className = 'hub-update';
    update.textContent = 'Update';
    update.href = __USERSCRIPT_DOWNLOAD_URL__;
    update.target = '_blank';
    update.rel = 'noopener noreferrer';
    update.referrerPolicy = 'no-referrer';
    update.setAttribute('aria-label', 'Update Card Offer Hub');
    update.title = 'Open the latest installer in a new tab. After updating, reload this bank page.';
    const releaseRow = document.createElement('div');
    releaseRow.className = 'hub-release';
    releaseRow.append(release, update);
    // Brand, version and update share one line so the header stays two lines tall.
    const topline = document.createElement('div');
    topline.className = 'hub-topline';
    topline.append(eyebrow, releaseRow);
    header.insertBefore(heading, title);
    header.insertBefore(mark, heading);
    heading.append(topline, title);
}
