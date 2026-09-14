'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, panelScripts } = require('./load');
const build = require('../scripts/build');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pages = ['devtools.html', 'panel.html'].map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]);

test('manifest v3 for a DevTools page, no permissions', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.devtools_page, 'devtools.html');
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.content_scripts, undefined);
});

test('package.json version matches the manifest', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, manifest.version);
});

test('referenced files exist', () => {
  const files = [manifest.devtools_page, ...Object.values(manifest.icons), 'devtools.js', 'panel.html', 'panel.js', 'panel.css', ...panelScripts()];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  assert.match(fs.readFileSync(path.join(root, 'devtools.js'), 'utf8'), /"panel\.html"/);
});

test('pages satisfy the MV3 content security policy', () => {
  for (const [name, html] of pages) {
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, `${name}: inline <script>`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${name}: inline event handler`);
    assert.doesNotMatch(html, /<script[^>]*src="https?:/, `${name}: remote script`);
    assert.doesNotMatch(html, /href="javascript:/, `${name}: javascript: URL`);
  }
});

test('build script packs exactly the extension files', () => {
  const listed = build.files;
  for (const file of ['manifest.json', 'devtools.html', 'devtools.js', 'panel.html', 'panel.js', 'panel.css', 'LICENSE', 'images', 'lib']) {
    assert.ok(listed.includes(file), `${file} is not packed`);
  }
  for (const file of listed) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is packed but missing`);
  }
  for (const src of [...panelScripts(), 'panel.js', 'panel.css']) {
    assert.ok(listed.some((f) => src === f || src.startsWith(f + '/')), `${src} would be left out of the zip`);
  }
  assert.ok(!listed.includes('demo'), 'the demo traffic is not for the store');
});

test('the Firefox build adds the add-on id and nothing else', () => {
  const ff = build.firefoxManifest(manifest);
  assert.equal(ff.browser_specific_settings.gecko.id, 'graphql-devtools@snov.me');
  assert.match(ff.browser_specific_settings.gecko.strict_min_version, /^\d+\.\d+$/);
  const { browser_specific_settings, ...rest } = ff;
  assert.deepEqual(rest, manifest);
  assert.equal(manifest.browser_specific_settings, undefined, 'the Chrome manifest stays free of the Firefox key');
});
