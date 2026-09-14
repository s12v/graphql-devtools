'use strict';
// Packs the extension into dist/: graphql-devtools-<version>.zip for Chrome and
// graphql-devtools-<version>-firefox.zip, the same files with the manifest Firefox
// needs (an add-on id). Only the files the browser needs — nothing from test/,
// demo/, .github/ or the npm metadata.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const files = ['manifest.json', 'devtools.html', 'devtools.js', 'panel.html', 'panel.js', 'panel.css', 'LICENSE', 'images', 'lib'];

// Firefox MV3 requires an id; Chrome would warn about the key, so it lives only in this build
function firefoxManifest(manifest) {
  return Object.assign({}, manifest, {
    browser_specific_settings: { gecko: { id: 'graphql-devtools@snov.me', strict_min_version: '115.0' } },
  });
}

function zip(out, cwd, list) {
  fs.rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', out, ...list], { cwd, stdio: 'inherit' });
  console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

function build() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    console.error(`version mismatch: manifest.json ${manifest.version}, package.json ${pkg.version}`);
    process.exit(1);
  }
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  zip(path.join(dist, `graphql-devtools-${manifest.version}.zip`), root, files);

  const staging = path.join(dist, 'firefox');
  fs.rmSync(staging, { recursive: true, force: true });
  for (const f of files) {
    fs.cpSync(path.join(root, f), path.join(staging, f), { recursive: true });
  }
  fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(firefoxManifest(manifest), null, 2) + '\n');
  zip(path.join(dist, `graphql-devtools-${manifest.version}-firefox.zip`), staging, files);
  fs.rmSync(staging, { recursive: true, force: true });
}

if (require.main === module) build();

module.exports = { files, firefoxManifest };
