'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ctx } = require('./load');

const { json, format } = ctx;

test('format pretty-prints JSON and leaves other text alone', () => {
  assert.equal(json.format('{"a":[1,{"b":null}]}'), '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ]\n}');
  assert.equal(json.format('<html>'), '<html>');
  assert.equal(json.format(''), '');
  assert.equal(json.parse('nope'), undefined);
});

test('tokens: keys, strings, numbers, keywords, punctuation, junk', () => {
  const t = json.tokens('{"a": "x", "n": -1.5e2, "t": true, "z": null, "l": [1, ?]}').filter((x) => x.type !== 'space').map((x) => x.type + ':' + x.text);
  assert.deepEqual(t, ['punct:{', 'key:"a"', 'punct::', 'string:"x"', 'punct:,', 'key:"n"', 'punct::', 'number:-1.5e2', 'punct:,',
    'key:"t"', 'punct::', 'keyword:true', 'punct:,', 'key:"z"', 'punct::', 'keyword:null', 'punct:,', 'key:"l"', 'punct::', 'punct:[',
    'number:1', 'punct:,', 'error:?', 'punct:]', 'punct:}']);
  assert.equal(json.tokens('"a\\"b" : 1')[0].type, 'key');
});

test('highlight wraps and escapes; huge bodies stay plain', () => {
  assert.equal(json.highlight('{"a":"<"}'), '<span class="t-punct">{</span><span class="t-key">&quot;a&quot;</span><span class="t-punct">:</span><span class="t-string">&quot;&lt;&quot;</span><span class="t-punct">}</span>');
  const big = '"' + 'x'.repeat(json.LIMIT) + '"';
  assert.equal(json.highlight(big), '&quot;' + 'x'.repeat(json.LIMIT) + '&quot;');
});

test('format.bytes and format.ms like the Network panel', () => {
  assert.equal(format.bytes(0), '0 B');
  assert.equal(format.bytes(478), '478 B');
  assert.equal(format.bytes(1500), '1.5 kB');
  assert.equal(format.bytes(15000), '15 kB');
  assert.equal(format.bytes(2345678), '2.3 MB');
  assert.equal(format.bytes(-1), '');
  assert.equal(format.bytes(null), '');
  assert.equal(format.ms(448.23), '448 ms');
  assert.equal(format.ms(1234), '1.23 s');
  assert.equal(format.ms(1000), '1 s');
  assert.equal(format.ms(65000), '1.1 min');
  assert.equal(format.ms(undefined), '');
});

test('format.path, host, escape', () => {
  assert.equal(format.path('https://api.example.com/graphql?x=1'), '/graphql?x=1');
  assert.equal(format.path('not a url'), 'not a url');
  assert.equal(format.host('https://api.example.com:8443/graphql'), 'api.example.com:8443');
  assert.equal(format.host('nope'), '');
  assert.equal(format.escape('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});
