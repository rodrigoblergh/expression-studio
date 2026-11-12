const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function runtime() {
  const c = vm.createContext({});
  c.window = c;
  for (const f of ['lib/acorn/acorn.js', 'lib/acorn/walk.js', 'js/ae-docs.js', 'js/annotator.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c);
  }
  return c;
}
function editor(source) {
  return {
    text: source,
    getLine(n) { return this.text.split('\n')[n]; },
    replaceRange(text, from, to = from) {
      const offset = p => this.text.split('\n').slice(0, p.line).reduce((n, s) => n + s.length + 1, 0) + p.ch;
      this.text = this.text.slice(0, offset(from)) + text + this.text.slice(offset(to));
    }
  };
}
for (const source of [
  'var amp = 20;\nMath.sin(time) * amp;',
  'function f() { return /* explanation */\nvalue; }\nf();',
  'var x = `first\n${value}\nlast`;\nx;',
  'var x = /a\\/b/;\n/* header\nvalue\n*/\nvalue;',
  'var x = "http://example.test"; // comment\nvar y = 1/* between */+2;\ny;'
]) {
  test('annotation and cleaning preserve AST: ' + source.slice(0, 35), () => {
    const c = runtime();
    const cm = editor(source);
    const shape = s => c.astShape(c.acorn.parse(s, c.ACORN_OPTS));
    const original = shape(source);
    assert.equal(c.annotateCode(source, cm, null).error, null);
    assert.equal(shape(cm.text), original);
    assert.equal(c.removeCodeComments(cm.text, cm).error, null);
    assert.equal(shape(cm.text), original);
  });
}
test('preprocessor include survives cleaning and annotation is refused', () => {
  const c = runtime();
  const source = '//@include "host.jsx"\n// ordinary comment\nvalue;';
  const cm = editor(source);
  assert.match(c.annotateCode(source, cm, null).error, /Preprocessor/);
  assert.equal(cm.text, source);
  assert.equal(c.removeCodeComments(source, cm).error, null);
  assert.match(cm.text, /\/\/@include "host.jsx"/);
  assert.doesNotMatch(cm.text, /ordinary comment/);
});
function hints(token, cursor, value) {
  let hint;
  const c = vm.createContext({ AEDocs: { wiggle: { category: 'function', args: ['freq', 'amp'] }, 'Math.sin': {category: 'math'}, 'Math.PI': {category: 'math'} }, CodeMirror: {
    Pos: (line, ch) => ({ line, ch }), registerHelper: (_, __, f) => { hint = f; }
  }});
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ae-hint.js'), 'utf8'), c);
  return hint({getCursor: () => ({line: 0, ch: cursor}), getTokenAt: () => token, getValue: () => value, getLine: () => value});
}
test('completion filters using text before the cursor while replacing the full token', () => {
  const r = hints({start: 0, end: 7, string: 'wigXXXX', type: 'variable'}, 3, 'wigXXXX');
  assert.ok(r.list.some(x => x.text === 'wiggle()'));
  assert.equal(r.from.ch, 0);
  assert.equal(r.to.ch, 7);
});
test('completion does not rewrite string and comment text', () => {
  for (const type of ['string', 'comment']) assert.equal(hints({start: 0, end: 3, string: 'wig', type}, 3, 'wig').list.length, 0);
});
test('document identifiers named __proto__ are suggested safely', () => {
  const r = hints({start: 0, end: 3, string: '__p', type: 'variable'}, 3, '__proto__ __p');
  assert.ok(r.list.some(x => x.text === '__proto__'));
});
test('Math member completion avoids duplicated qualifiers and supplies call parentheses', () => {
  const r = hints({start: 5, end: 7, string: 'si', type: 'property'}, 7, 'Math.si');
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].text, 'sin()');
  assert.equal(r.from.ch, 5);
});
test('Math constants remain values when completing after a dot', () => {
  const r = hints({start: 4, end: 5, string: '.', type: null}, 5, 'Math.');
  assert.ok(r.list.some(x => x.text === 'PI'));
  assert.ok(r.list.some(x => x.text === 'sin()'));
  assert.equal(r.from.ch, 5);
});
