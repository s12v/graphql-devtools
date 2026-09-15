'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ctx, entry } = require('./load');

const { har } = ctx;

const ops = (e) => har.operations(e);

test('JSON POST with a query', () => {
  const e = entry({ body: { query: 'query Viewer { viewer { login } }' } });
  const [op] = ops(e);
  assert.equal(ops(e).length, 1);
  assert.equal(op.query, 'query Viewer { viewer { login } }');
  assert.deepEqual(op.variables, {});
  assert.equal(op.operationName, null);
  assert.equal(op.type, 'query');
  assert.equal(op.name, 'Viewer');
  assert.equal(op.label, 'Viewer');
  assert.equal(op.batch, false);
  assert.equal(op.index, 0);
});

test('variables as an object and as a JSON string (#3)', () => {
  assert.deepEqual(ops(entry({ body: { query: '{a}', variables: { id: 1 } } }))[0].variables, { id: 1 });
  assert.deepEqual(ops(entry({ body: { query: '{a}', variables: '{"id": 1}' } }))[0].variables, { id: 1 });
  assert.deepEqual(ops(entry({ body: { query: '{a}', variables: null } }))[0].variables, {});
  assert.deepEqual(ops(entry({ body: { query: '{a}', variables: 'oops' } }))[0].variables, { '': 'oops' });
});

test('operationName picks the operation of a multi-operation document', () => {
  const doc = 'query A { a } mutation B($x: Int) { b(x: $x) }';
  const op = ops(entry({ body: { query: doc, operationName: 'B', variables: { x: 1 } } }))[0];
  assert.equal(op.type, 'mutation');
  assert.equal(op.label, 'B');
  const noName = ops(entry({ body: { query: doc } }))[0];
  assert.equal(noName.label, 'A, B');
  assert.equal(noName.multiple, true);
});

test('anonymous operations are labelled by their first field', () => {
  assert.equal(ops(entry({ body: { query: '{ viewer { id } }' } }))[0].label, '{ viewer }');
  assert.equal(ops(entry({ body: { query: '{ a { id } b }' } }))[0].label, '{ a, … }');
  assert.equal(ops(entry({ body: { query: 'mutation { like(id: 1) { ok } }' } }))[0].type, 'mutation');
});

test('not GraphQL: JSON without a query, HTML, empty body (#2)', () => {
  assert.deepEqual(ops(entry({ body: { user: 'x' } })), []);
  assert.deepEqual(ops(entry({ body: '<html>', mime: 'text/html' })), []);
  assert.deepEqual(ops(entry({ body: '', mime: 'application/json' })), []);
  assert.deepEqual(ops(entry({})), []);
  assert.deepEqual(ops(entry({ body: '{"query": 5}' })), []);
  assert.deepEqual(ops({}), []);
  assert.equal(har.isGraphQL(entry({ body: { query: '{a}' } })), true);
});

test('JSON sent as text/plain is still recognised (#2)', () => {
  const e = entry({ body: '{"query":"{ me }"}', mime: 'text/plain;charset=UTF-8' });
  assert.equal(ops(e)[0].label, '{ me }');
});

test('batched operations become one row each (#2, PR #7)', () => {
  const e = entry({ body: [{ query: 'query A { a }' }, { query: 'query B { b }', variables: { x: 1 } }, { junk: true }] });
  const list = ops(e);
  assert.deepEqual(list.map((o) => o.label), ['A', 'B']);
  assert.deepEqual(list.map((o) => o.index), [0, 1]);
  assert.ok(list.every((o) => o.batch));
});

test('GET with the query in the URL', () => {
  const url = 'https://api.example.com/graphql?query=' + encodeURIComponent('query Q($id: ID!) { node(id: $id) { id } }')
    + '&variables=' + encodeURIComponent('{"id":"1"}') + '&operationName=Q';
  const [op] = ops(entry({ url }));
  assert.equal(op.label, 'Q');
  assert.deepEqual(op.variables, { id: '1' });
  assert.equal(op.operationName, 'Q');
  assert.deepEqual(ops(entry({ url: 'https://api.example.com/graphql?foo=1' })), []);
});

test('application/graphql body', () => {
  const [op] = ops(entry({ body: '{ me { id } }', mime: 'application/graphql', url: 'https://x.io/g?variables=%7B%22a%22%3A1%7D' }));
  assert.equal(op.query, '{ me { id } }');
  assert.deepEqual(op.variables, { a: 1 });
});

test('form-encoded body', () => {
  const [op] = ops(entry({ body: 'query=%7B%20me%20%7D&variables=%7B%22a%22%3A1%7D', mime: 'application/x-www-form-urlencoded' }));
  assert.equal(op.query, '{ me }');
  assert.deepEqual(op.variables, { a: 1 });
  const withParams = entry({ body: '', mime: 'application/x-www-form-urlencoded', params: [{ name: 'query', value: '{ you }' }] });
  assert.equal(ops(withParams)[0].label, '{ you }');
});

test('multipart upload (graphql-multipart-request-spec)', () => {
  const boundary = '----WebKitFormBoundaryabc';
  const text = [
    `--${boundary}`, 'Content-Disposition: form-data; name="operations"', '',
    JSON.stringify({ query: 'mutation Up($f: Upload!) { upload(file: $f) { id } }', variables: { f: null } }),
    `--${boundary}`, 'Content-Disposition: form-data; name="map"', '', '{"0":["variables.f"]}',
    `--${boundary}`, 'Content-Disposition: form-data; name="0"; filename="a.txt"', 'Content-Type: text/plain', '', 'hello',
    `--${boundary}--`, '',
  ].join('\r\n');
  const [op] = ops(entry({ body: text, mime: `multipart/form-data; boundary=${boundary}` }));
  assert.equal(op.label, 'Up');
  assert.equal(op.type, 'mutation');
  assert.deepEqual(op.variables, { f: null });
  // Chrome may hand the fields over as params instead of the raw body
  const viaParams = entry({ body: '', mime: 'multipart/form-data; boundary=x', params: [{ name: 'operations', value: '[{"query":"{ a }"},{"query":"{ b }"}]' }] });
  assert.deepEqual(ops(viaParams).map((o) => o.label), ['{ a }', '{ b }']);
  assert.ok(ops(viaParams)[0].batch);
});

test('persisted queries: Apollo hash and Relay document ids', () => {
  const apollo = ops(entry({ body: { operationName: 'Feed', variables: { first: 10 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38' } } } }))[0];
  assert.equal(apollo.query, null);
  assert.equal(apollo.persisted, 'ecf4edb46db40b5132295c0291d62fb65d6759a9eedfa4d5d612dd5ec54a6b38');
  assert.equal(apollo.label, 'Feed');
  assert.equal(apollo.type, '');
  const hashOnly = ops(entry({ body: { extensions: { persistedQuery: { version: 1, sha256Hash: 'ecf4edb46db40b5132' } } } }))[0];
  assert.equal(hashOnly.label, 'persisted ecf4edb4…');
  const relay = ops(entry({ body: { doc_id: '4213', variables: { id: 'x' } } }))[0];
  assert.equal(relay.documentId, '4213');
  assert.equal(relay.label, '#4213');
  // an id alone is just some JSON
  assert.deepEqual(ops(entry({ body: { id: '4213' } })), []);
  // Instagram: query_hash in the URL (old) or doc_id + fb_api_req_friendly_name in a form body (current)
  const ig = ops(entry({ url: 'https://www.instagram.com/graphql/query/?query_hash=9b498c08113f1e09617a1703c22b2f32&variables=%7B%22id%22%3A%2225025320%22%7D' }))[0];
  assert.equal(ig.documentId, '9b498c08113f1e09617a1703c22b2f32');
  assert.equal(ig.label, '#9b498c08113f1e09617a1703c22b2f32');
  assert.deepEqual(ig.variables, { id: '25025320' });
  const fb = ops(entry({ body: 'fb_api_req_friendly_name=PolarisProfilePageContentQuery&variables=%7B%22username%22%3A%22x%22%7D&doc_id=7663723823674585', mime: 'application/x-www-form-urlencoded' }))[0];
  assert.equal(fb.label, 'PolarisProfilePageContentQuery');
  assert.equal(fb.documentId, '7663723823674585');
  assert.deepEqual(fb.variables, { username: 'x' });
  // the query wins over the hash when both are sent (APQ retry)
  const both = ops(entry({ body: { query: 'query Feed { feed { id } }', extensions: { persistedQuery: { sha256Hash: 'abc' } } } }))[0];
  assert.equal(both.label, 'Feed');
  assert.equal(both.persisted, 'abc');
});

test('size falls back when content.size is -1 (#30)', () => {
  assert.equal(har.size(entry({ size: 478 })), 478);
  assert.equal(har.size(entry({ size: -1, response: { bodySize: 300 } })), 300);
  assert.equal(har.size(entry({ size: -1, response: { bodySize: -1, _transferSize: 512 } })), 512);
  assert.equal(har.size(entry({ size: -1, response: { bodySize: -1 } })), null);
  assert.equal(har.size({}), null);
});

test('response of one operation: whole body, or element i of a batch', () => {
  const single = har.response('{"data":{"a":1},"errors":[{"message":"x"},{"message":"y"}]}', { batch: false, index: 0 });
  assert.equal(single.errors, 2);
  assert.deepEqual(single.value, { data: { a: 1 }, errors: [{ message: 'x' }, { message: 'y' }] });
  const batch = har.response('[{"data":{"a":1}},{"errors":[{"message":"no"}]}]', { batch: true, index: 1 });
  assert.equal(batch.errors, 1);
  assert.equal(batch.text, '{\n  "errors": [\n    {\n      "message": "no"\n    }\n  ]\n}');
  const html = har.response('<html>oops', { batch: false, index: 0 });
  assert.equal(html.value, undefined);
  assert.equal(html.text, '<html>oops');
  assert.equal(html.errors, 0);
  assert.equal(har.response('', null).text, '');
});

test('headers are matched case-insensitively', () => {
  assert.equal(har.header([{ name: 'Content-Type', value: 'a' }], 'content-type'), 'a');
  assert.equal(har.header([], 'x'), null);
  assert.equal(har.header(undefined, 'x'), null);
  assert.equal(har.mime([{ name: 'content-type', value: 'Application/JSON; charset=utf-8' }]), 'application/json');
  assert.equal(har.mime([]), '');
});

test('copy as cURL', () => {
  const e = entry({ body: { query: "{ me { name } }", variables: { q: "it's" } } });
  e.request.headers.push({ name: ':authority', value: 'api.example.com' }, { name: 'Content-Length', value: '42' }, { name: 'Authorization', value: 'Bearer x' });
  assert.equal(har.curl(e), [
    "curl 'https://api.example.com/graphql'",
    "-H 'Content-Type: application/json'",
    "-H 'Authorization: Bearer x'",
    "--data-raw '{\"query\":\"{ me { name } }\",\"variables\":{\"q\":\"it'\\''s\"}}'",
  ].join(' \\\n  '));
  assert.equal(har.curl(entry({ url: 'https://x.io/g?query=%7Ba%7D' })), "curl 'https://x.io/g?query=%7Ba%7D'");
  const put = entry({ body: '{"query":"{a}"}' });
  put.request.method = 'PUT';
  assert.match(har.curl(put), /^curl 'https:\/\/api.example.com\/graphql' \\\n  -X PUT \\\n/);
  const emptyPost = entry({ body: '' });
  assert.equal(har.curl(emptyPost), "curl 'https://api.example.com/graphql' \\\n  -H 'Content-Type: application/json' \\\n  -X POST");
  assert.equal(har.curl({}), "curl ''");
  assert.equal(har.headerLines([{ name: 'a', value: '1' }, { name: 'b', value: '2' }]), 'a: 1\nb: 2');
  assert.equal(har.headerLines(undefined), '');
});

test('a "query" that is not a GraphQL document is not GraphQL', () => {
  assert.deepEqual(ops(entry({ url: 'https://example.com/search?query=hello%20world' })), []);
  assert.deepEqual(ops(entry({ url: 'https://example.com/api?query=hello&variables=1' })), []);
  assert.deepEqual(ops(entry({ body: { query: 'hello' } })), []);
  assert.deepEqual(ops(entry({ body: { query: '' } })), []);
  assert.deepEqual(ops(entry({ body: 'query=hello', mime: 'application/x-www-form-urlencoded' })), []);
  // a hash where the document should be is a persisted query (GitHub's web client)
  const gh = ops(entry({ body: { persistedQueryName: 'OpenClosedTabsQuery', query: '9b5335baab0566640cfa28c329582507', variables: { owner: 's12v' } } }))[0];
  assert.equal(gh.documentId, '9b5335baab0566640cfa28c329582507');
  assert.equal(gh.query, null);
  assert.equal(gh.label, 'OpenClosedTabsQuery');
  // the same hash with a real document beside it is a document
  assert.equal(ops(entry({ body: { query: '{ a }', extensions: { persistedQuery: { sha256Hash: 'ab' } } } }))[0].query, '{ a }');
});

test('GitHub: the JSON body in a ?body= parameter', () => {
  const url = 'https://github.com/_graphql?body=' + encodeURIComponent(JSON.stringify({ persistedQueryName: 'OpenClosedTabsQuery', query: '9b5335baab0566640cfa28c329582507', variables: { name: 'graphql-devtools' } }));
  const [op] = ops(entry({ url }));
  assert.equal(op.label, 'OpenClosedTabsQuery');
  assert.deepEqual(op.variables, { name: 'graphql-devtools' });
  assert.deepEqual(ops(entry({ url: 'https://example.com/x?body=' + encodeURIComponent('{"a":1}') })), []);
  assert.deepEqual(ops(entry({ url: 'https://example.com/x?body=plain' })), []);
});

test('X / Twitter: query id and operation name in the path, variables in the URL', () => {
  const [op] = ops(entry({ url: 'https://x.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserByScreenName?variables=%7B%22screen_name%22%3A%22github%22%7D&features=%7B%7D' }));
  assert.equal(op.documentId, 'E3opETHurmVJflFsUBVuUQ');
  assert.equal(op.label, 'UserByScreenName');
  assert.deepEqual(op.variables, { screen_name: 'github' });
  assert.deepEqual(ops(entry({ url: 'https://x.com/i/api/graphql/E3opETHurmVJflFsUBVuUQ/UserByScreenName' })), [], 'no variables: not a request we understand');
  assert.deepEqual(ops(entry({ url: 'https://example.com/docs/graphql/intro/Basics?variables=x' })), [], 'a short id is a doc path');
});

test('withQuery: a learned document names and types a persisted row', () => {
  const [op] = ops(entry({ body: { operationName: 'Feed', variables: { first: 10 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' } } } }));
  assert.equal(op.type, '');
  const full = har.withQuery(op, 'query Feed($first: Int) { feed(first: $first) { id } }');
  assert.equal(full.query, 'query Feed($first: Int) { feed(first: $first) { id } }');
  assert.equal(full.type, 'query');
  assert.equal(full.label, 'Feed');
  assert.equal(full.learned, true);
  assert.equal(full.persisted, 'abc');
  assert.equal(op.query, null, 'the original is untouched');
  const hashOnly = ops(entry({ body: { extensions: { persistedQuery: { sha256Hash: 'abc' } } } }))[0];
  assert.equal(har.withQuery(hashOnly, 'mutation { like { ok } }').label, '{ like }');
});

test('timings and Server-Timing', () => {
  assert.equal(har.timings({ timings: { blocked: 1.2, dns: -1, connect: -1, ssl: -1, send: 0.1, wait: 210.4, receive: 12 } }), 'blocked 1 ms · send 0 ms · wait 210 ms · receive 12 ms');
  assert.equal(har.timings({ timings: { wait: 0, receive: 0 } }), 'wait 0 ms · receive 0 ms');
  assert.equal(har.timings({}), '');
  assert.equal(har.serverTiming([{ name: 'Server-Timing', value: 'db;dur=53, app;desc="render";dur=47.2, cache;desc=hit' }]), 'db 53 ms · app (render) 47 ms · cache (hit)');
  assert.equal(har.serverTiming([]), '');
});

test('replay: the request as a fetch the page can make again', () => {
  const e = entry({ body: { query: '{ me { id } }' } });
  e.request.headers.push({ name: ':authority', value: 'x' }, { name: 'Cookie', value: 'a=1' }, { name: 'Authorization', value: 'Bearer t' }, { name: 'X-Client', value: 'web' }, { name: 'User-Agent', value: 'UA' }, { name: 'Sec-Fetch-Mode', value: 'cors' });
  const r = har.replay(e);
  assert.equal(r.url, 'https://api.example.com/graphql');
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer t', 'X-Client': 'web' });
  assert.equal(r.body, '{"query":"{ me { id } }"}');
  assert.equal(har.replay(e, '{"query":"{ you }"}').body, '{"query":"{ you }"}');
  const get = har.replay(entry({ url: 'https://x.io/g?query=%7Ba%7D' }));
  assert.equal(get.method, 'GET');
  assert.equal(get.body, null);
  const code = har.replayCode(r);
  assert.match(code, /^\(function \(r\) \{ fetch\(r\.url, \{ method: r\.method, headers: r\.headers, body: r\.body, credentials: "include" \}\)/);
  assert.ok(code.endsWith(')'));
  // the code parses and carries the spec
  const seen = [];
  new Function('fetch', code)((url, init) => { seen.push([url, init]); return Promise.reject(); });
  assert.equal(seen[0][0], r.url);
  assert.equal(seen[0][1].body, r.body);
});

test('editedBody: the JSON body with the document and variables replaced', () => {
  const e = entry({ body: { operationName: 'Feed', query: 'query Feed { feed { id } }', variables: { first: 10 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' }, tracing: true } } });
  const [op] = har.operations(e);
  const same = JSON.parse(har.editedBody(e, op, op.query, { first: 5 }));
  assert.deepEqual(same, { operationName: 'Feed', query: 'query Feed { feed { id } }', variables: { first: 5 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' }, tracing: true } });
  const changed = JSON.parse(har.editedBody(e, op, 'query Feed2 { feed { id title } }', { first: 5 }));
  assert.deepEqual(changed, { operationName: 'Feed2', query: 'query Feed2 { feed { id title } }', variables: { first: 5 }, extensions: { tracing: true } });
  // a batch member becomes a single request
  const batch = entry({ body: [{ query: '{ a }' }, { query: '{ b }', variables: { x: 1 } }] });
  const second = har.operations(batch)[1];
  assert.deepEqual(JSON.parse(har.editedBody(batch, second, '{ b c }', { x: 2 })), { query: '{ b c }', variables: { x: 2 } });
  // a hash-only request keeps its extensions when only the variables change
  const apq = entry({ body: { operationName: 'Feed', variables: { first: 10 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' } } } });
  const apqOp = har.operations(apq)[0];
  assert.deepEqual(JSON.parse(har.editedBody(apq, apqOp, null, { first: 1 })), { operationName: 'Feed', variables: { first: 1 }, extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' } } });
  // not editable: GET, forms
  assert.equal(har.editedBody(entry({ url: 'https://x.io/g?query=%7Ba%7D' }), { index: 0 }, '{ a }', {}), null);
  assert.equal(har.editedBody(entry({ body: 'query=%7Ba%7D', mime: 'application/x-www-form-urlencoded' }), { index: 0 }, '{ a }', {}), null);
});
