# GraphQL developer tools (Chrome extension)

[![CI](https://github.com/s12v/graphql-devtools/actions/workflows/ci.yml/badge.svg)](https://github.com/s12v/graphql-devtools/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A **GraphQL** panel in Chrome DevTools: every GraphQL operation the page sends, with its query, variables,
response, errors and headers — the Network panel, narrowed down to GraphQL.

Demo with sample traffic: https://s12v.github.io/graphql-devtools/

## Install

[Chrome Web Store](https://chromewebstore.google.com/detail/hflnkihcpgldmkepajmpooacmmhglpff), then open DevTools on
any page that talks GraphQL — the **GraphQL** tab is at the end of the tab strip.

To run from source: `git clone https://github.com/s12v/graphql-devtools`, open `chrome://extensions`, enable
**Developer mode**, **Load unpacked** → select the `graphql-devtools` directory.

## What it shows

* One row per operation: name (the operation name, or the first field of an anonymous query), type
  (query / mutation / subscription), HTTP status with the number of GraphQL `errors`, size, time, URL.
  Rows with an HTTP error or GraphQL errors are red.
* **Query** tab: the document with syntax colours, the variables and the extensions under it.
* **Response** tab: the pretty-printed response, with the error messages on top.
* **Headers** tab: URL, method, status, timing, request and response headers, **Copy as cURL**.
* Every block has a **Copy** button.
* Filter by name, URL or variables; **Clear**; **Preserve log** across navigations; arrow keys move
  the selection; Cmd/Ctrl+F focuses the filter.
* Requests recorded since DevTools was opened appear when the panel is first shown.
* Follows the DevTools theme, light or dark.

Recognised request shapes: a JSON body with `query` (whatever the `Content-Type`), a batch (JSON array),
`GET` with the query in the URL, `application/graphql`, form-encoded and multipart uploads
(`operations` field), and persisted queries — Apollo's `extensions.persistedQuery.sha256Hash` or a
Relay-style document id — which are listed by their operation name.

## Privacy

Everything happens in the DevTools window: the extension reads requests through the DevTools network API,
makes no requests of its own and requests no permissions. Full text: [PRIVACY.md](PRIVACY.md).

## Development

No build step, no dependencies. Tests run on Node 20+:

```
npm test
```

`panel.html` opened outside DevTools (serve the directory over HTTP, e.g. `python3 -m http.server`) shows the
sample traffic from `demo/har.js`; add `?theme=dark` for the dark palette.

## Release

1. Set the same new version in `manifest.json` and `package.json`, commit.
2. Tag and push: `git tag v1.0.1 && git push origin master v1.0.1`.
3. The Release workflow runs the tests, builds `graphql-devtools-1.0.1.zip` (`npm run build` does the same
   locally into `dist/`) and attaches it to a GitHub Release.
4. Upload the zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

## License

MIT
