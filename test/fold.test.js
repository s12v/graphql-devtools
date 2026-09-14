'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ctx } = require('./load');

const { fold, json, graphql } = ctx;

const lines = (html) => html.split('</div>').filter(Boolean).map((l) => l + '</div>');
const attrs = (l) => /data-end="(\d+)" data-depth="(\d+)"/.exec(l);
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (l) => unescape(l.replace(/<span class="ellipsis"[^>]*>[^<]*<\/span>/, '').replace(/<[^>]+>/g, ''));

test('JSON: multi-line brackets fold, with key and item counts', () => {
  const src = json.pretty({ a: { b: 1, c: [1, 2, 3], d: {} }, e: [], f: 'x' });
  const html = fold.render(json.tokens(src), true);
  const ls = lines(html);
  assert.equal(ls.length, src.split('\n').length);
  assert.deepEqual(ls.map(text), src.split('\n'));
  // line 0 "{" folds to the last line, depth 0, 3 keys
  assert.deepEqual(attrs(ls[0]).slice(1), [String(ls.length - 1), '0']);
  assert.match(ls[0], /<span class="ellipsis" title="Expand">… 3 keys<\/span>/);
  // "a": {  → 3 keys, depth 1; "c": [ → 3 items, depth 2; "d": {} and "e": [] are one line: no fold
  assert.match(ls[1], /data-depth="1"/);
  assert.match(ls[1], /… 3 keys/);
  assert.match(ls[3], /data-end="7" data-depth="2"/);
  assert.match(ls[3], /… 3 items/);
  for (const i of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    assert.doesNotMatch(ls[i], /data-end/, `line ${i}: ${text(ls[i])}`);
  }
  assert.equal((html.match(/class="toggle"/g) || []).length, 3);
  assert.equal((html.match(/class="gutter"/g) || []).length, ls.length);
});

test('a bracket closing on the same line does not fold; empty containers say 0', () => {
  assert.doesNotMatch(fold.render(json.tokens('{"a": 1}'), true), /data-end/);
  const html = fold.render(json.tokens('[\n  {\n  }\n]'), true);
  assert.match(html, /… 1 item/);
  assert.match(html, /… 0 keys/);
  assert.match(fold.render(json.tokens('[\n 1\n]'), true), /… 1 item/);
});

test('the outermost multi-line bracket owns the line', () => {
  const html = fold.render(json.tokens('[{\n  "a": 1\n}]'), true);
  const ls = lines(html);
  assert.deepEqual(attrs(ls[0]).slice(1), ['2', '0']);
  assert.match(ls[0], /… 1 item/);
});

test('brackets inside strings and comments are ignored', () => {
  const html = fold.render(json.tokens('{\n  "a": "{[("\n}'), true);
  assert.equal((html.match(/data-end/g) || []).length, 1);
  const gql = fold.render(graphql.classify(graphql.tokens('{\n  # }\n  a(s: "}")\n}')), false);
  assert.equal((gql.match(/data-end/g) || []).length, 1);
  assert.match(gql, /<span class="ellipsis" title="Expand">…<\/span>/);
});

test('GraphQL: selection sets and multi-line arguments fold, no counts', () => {
  const src = 'query Q(\n  $a: Int\n) {\n  user(id: $a) {\n    name\n  }\n}';
  const html = fold.render(graphql.classify(graphql.tokens(src)), false);
  const ls = lines(html);
  assert.deepEqual(attrs(ls[0]).slice(1), ['2', '0']);       // the ( … ) of the variable definitions
  assert.match(ls[0], /title="Expand">…</);
  assert.deepEqual(attrs(ls[2]).slice(1), ['6', '0']);       // ) {  → the selection set
  assert.deepEqual(attrs(ls[3]).slice(1), ['5', '1']);
  assert.equal(attrs(ls[4]), null);
});

test('block strings keep their colour across lines; \\r is dropped', () => {
  const html = fold.render(graphql.tokens('{\r\n  a(s: """x\ny""")\r\n}'), false);
  const ls = lines(html);
  assert.equal(ls.length, 4);
  assert.match(ls[1], /<span class="t-string">&quot;&quot;&quot;x<\/span>/);
  assert.match(ls[2], /<span class="t-string">y&quot;&quot;&quot;<\/span>/);
  assert.doesNotMatch(html, /\r/);
});

test('escaping and line counting', () => {
  assert.match(fold.render(json.tokens('"<b>"'), true), /&lt;b&gt;/);
  assert.equal(fold.lines(''), 1);
  assert.equal(fold.lines('a\nb\n'), 3);
});
