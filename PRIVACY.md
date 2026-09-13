# Privacy policy

GraphQL developer tools is a browser extension that adds a GraphQL panel to Chrome DevTools. It lists the
GraphQL requests the inspected page makes and shows their queries, variables, responses and headers.

**Nothing leaves your browser.** The panel reads the requests through the DevTools network API, the same
data the built-in Network panel shows, and only while DevTools is open. It makes no network requests of its
own, embeds no analytics or telemetry, has no accounts and no backend.

**What is stored.** The panel keeps a few settings in the browser's `localStorage`: the selected details tab,
the width of the details pane and the state of the "Preserve log" checkbox. The requests themselves are held
in memory and are gone when DevTools closes.

**Permissions.** The extension requests no permissions. A DevTools extension sees the network traffic of the
page being inspected, in the DevTools window only; it does not read your browsing history, other tabs, or
pages you are not inspecting.

**Third parties.** No data is shared with anyone, because none is collected. The demo page at
https://s12v.github.io/graphql-devtools/ is a static site hosted on GitHub Pages with sample traffic built in;
GitHub may log the requests that load it, as described in
[GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

**Changes.** If this policy ever changes, the new text will be published in the extension's source repository.

**Contact.** Questions go to the [issue tracker](https://github.com/s12v/graphql-devtools/issues).

*Last updated: 13 September 2026.*
