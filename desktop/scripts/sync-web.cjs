// Copies the web build (../web) into ./game so Electron can package it.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'web');
const dst = path.join(__dirname, '..', 'game');
if (!fs.existsSync(path.join(src, 'highrise.wasm'))) {
  console.error('web/highrise.wasm is missing — run ./build.sh in the repo root first.');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (f.startsWith('_') || f.startsWith('.')) continue; // skip scratch/test pages
  fs.cpSync(path.join(src, f), path.join(dst, f), { recursive: true });
}
console.log('Synced web build →', dst);
