const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let count = 0;
function visit(dir) {
  for (const ent of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
    const name = path.join(dir, ent.name);
    if (ent.isDirectory()) visit(name);
    else if (/\.(js|jsx)$/.test(name)) {
      const code = fs.readFileSync(path.join(root, name), 'utf8').replace(/^\s*#.*$/gm, '');
      new vm.Script(code, {filename: name});
      count++;
    }
  }
}
for (const dir of ['js', 'jsx', 'lib', 'script_editor']) visit(dir);
for (const file of ['index.html', 'script_editor/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
    if (/^(https?:|data:)/.test(match[1])) continue;
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), match[1])), `${file}: missing ${match[1]}`);
  }
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1], {filename: file});
  }
}
const manifest = fs.readFileSync(path.join(root, 'CSXS/manifest.xml'), 'utf8');
const version = require('../package.json').version;
assert.ok(manifest.includes(`ExtensionBundleVersion="${version}"`));
assert.ok(manifest.includes(`Version="${version}"/>`));
assert.ok(!manifest.includes('--allow-running-insecure-content'));
console.log(`PASS: ${count} script files parse; HTML assets and manifest version verified.`);
