'use strict';
// Loads the panel's library scripts into a vm context the same way panel.html does
// (same files, same order), minus panel.js, which only wires the DOM.
// Everything under test is a plain global: har, graphql, json, format.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function panelScripts() {
  const html = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((m) => m[1])
    .filter((src) => src !== 'panel.js');
}

// The scripts run in this very realm (a separate vm context would give arrays and objects
// foreign prototypes, which assert.deepEqual rejects); each test file is its own process anyway.
function load() {
  globalThis.window = globalThis;
  for (const src of panelScripts()) {
    vm.runInThisContext(fs.readFileSync(path.join(root, src), 'utf8'), { filename: src });
  }
  return globalThis;
}

const ctx = load();

/* A HAR entry the way chrome.devtools.network builds one: a JSON POST unless told otherwise */
function entry(opts = {}) {
  const body = opts.body;
  const text = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
  const mime = opts.mime || (text === undefined ? undefined : 'application/json');
  const request = {
    method: opts.method || (text === undefined ? 'GET' : 'POST'),
    url: opts.url || 'https://api.example.com/graphql',
    httpVersion: 'http/2.0',
    headers: mime ? [{ name: 'Content-Type', value: mime }] : [],
  };
  if (text !== undefined || opts.params) {
    request.postData = { mimeType: mime, text: text === undefined ? '' : text };
    if (opts.params) request.postData.params = opts.params;
  }
  return {
    startedDateTime: '2026-09-13T10:00:00.000Z',
    time: opts.time === undefined ? 123.4 : opts.time,
    request,
    response: Object.assign({
      status: 200,
      statusText: 'OK',
      headers: [{ name: 'content-type', value: 'application/json' }],
      content: { size: opts.size === undefined ? 100 : opts.size, mimeType: 'application/json' },
      bodySize: -1,
    }, opts.response || {}),
    getContent: (cb) => cb(opts.content === undefined ? '{"data":{}}' : opts.content, undefined),
  };
}

module.exports = { ctx, root, panelScripts, entry };
