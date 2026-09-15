'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ctx } = require('./load');

const { graphql } = ctx;

const roles = (src) => graphql.classify(graphql.tokens(src))
  .filter((t) => t.type !== 'space')
  .map((t) => (t.role || t.type) + ':' + t.text);

test('tokens cover the whole input', () => {
  const src = 'query Q($id: ID! = 1) {\n  a: node(id: $id) @include(if: true) { ...F }\n} # end\nfragment F on Node { id """doc""" "s" 1.5e3 }';
  assert.equal(graphql.tokens(src).map((t) => t.text).join(''), src);
  const types = graphql.tokens('"""block\n"quoted"\n""" "str" # c\n 42 -1.5 ... $x @d { } ( ) [ ] : = ! | & ,').map((t) => t.type).filter((t) => t !== 'space');
  assert.deepEqual(types, ['string', 'string', 'comment', 'number', 'number', 'punct', 'punct', 'name', 'punct', 'name', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct', 'punct']);
  assert.deepEqual(graphql.tokens('a ~ b').map((t) => t.type), ['name', 'space', 'error', 'space', 'name']);
});

test('roles: keywords, definitions, variables, types, arguments, aliases, directives, fields', () => {
  assert.deepEqual(roles('query GetUser($id: ID!, $n: [Int] = 3) { user: node(id: $id, first: $n) @include(if: true) { id ...F } }'), [
    'keyword:query', 'def:GetUser', 'punct:(', 'variable:$', 'variable:id', 'punct::', 'type:ID', 'punct:!', 'variable:$', 'variable:n', 'punct::',
    'punct:[', 'type:Int', 'punct:]', 'punct:=', 'number:3', 'punct:)', 'punct:{', 'alias:user', 'punct::', 'field:node', 'punct:(',
    'argument:id', 'punct::', 'variable:$', 'variable:id', 'argument:first', 'punct::', 'variable:$', 'variable:n', 'punct:)', 'directive:@',
    'directive:include', 'punct:(', 'argument:if', 'punct::', 'keyword:true', 'punct:)', 'punct:{', 'field:id', 'punct:...', 'fragment:F',
    'punct:}', 'punct:}',
  ]);
  assert.deepEqual(roles('fragment F on User { name } { ... on Node { id } }'), [
    'keyword:fragment', 'def:F', 'keyword:on', 'type:User', 'punct:{', 'field:name', 'punct:}',
    'punct:{', 'punct:...', 'keyword:on', 'type:Node', 'punct:{', 'field:id', 'punct:}', 'punct:}',
  ]);
  // object values: keys and enums, not aliases and fields
  assert.deepEqual(roles('mutation { add(input: { name: "x", kind: ADMIN, on: null }) { id } }'), [
    'keyword:mutation', 'punct:{', 'field:add', 'punct:(', 'argument:input', 'punct::', 'punct:{', 'key:name', 'punct::', 'string:"x"',
    'key:kind', 'punct::', 'enum:ADMIN', 'key:on', 'punct::', 'keyword:null', 'punct:}', 'punct:)', 'punct:{', 'field:id', 'punct:}', 'punct:}',
  ]);
  // a field called "query" inside a selection is a field
  assert.deepEqual(roles('{ query { mutation } }'), ['punct:{', 'field:query', 'punct:{', 'field:mutation', 'punct:}', 'punct:}']);
});

test('highlight escapes and wraps', () => {
  assert.equal(graphql.highlight('{ a(s: "<b>") }'),
    '<span class="t-punct">{</span> <span class="t-field">a</span><span class="t-punct">(</span><span class="t-argument">s</span><span class="t-punct">:</span> <span class="t-string">&quot;&lt;b&gt;&quot;</span><span class="t-punct">)</span> <span class="t-punct">}</span>');
});

test('operations of a document', () => {
  assert.deepEqual(graphql.operations('{ viewer { login } repository(name: "x") { id } }'), [{ type: 'query', name: null, fields: ['viewer', 'repository'] }]);
  assert.deepEqual(graphql.operations('query Q($a: Int = 1) { me: user(id: $a) { id } }'), [{ type: 'query', name: 'Q', fields: ['user'] }]);
  assert.deepEqual(graphql.operations('fragment F on X { a }\nmutation M { like { ok } }\nsubscription S { onEvent { id } }'), [
    { type: 'mutation', name: 'M', fields: ['like'] },
    { type: 'subscription', name: 'S', fields: ['onEvent'] },
  ]);
  assert.deepEqual(graphql.operations('query { ...F a @skip(if: true) b }'), [{ type: 'query', name: null, fields: ['a', 'b'] }]);
  assert.deepEqual(graphql.operations('# comment\nquery A { a } query B { b }').map((o) => o.name), ['A', 'B']);
  assert.deepEqual(graphql.operations('not graphql at all'), []);
  assert.deepEqual(graphql.operations(''), []);
});

test('describe and label', () => {
  const two = 'query A { a } query B { b }';
  assert.deepEqual(graphql.describe(two, 'B'), { type: 'query', name: 'B', fields: ['b'], multiple: false });
  assert.deepEqual(graphql.describe(two, 'Zzz'), { type: '', name: 'Zzz', fields: [], multiple: false });
  assert.deepEqual(graphql.describe(two), { type: 'query', name: 'A, B', fields: ['a'], multiple: true });
  assert.deepEqual(graphql.describe('{ a b }'), { type: 'query', name: null, fields: ['a', 'b'], multiple: false });
  assert.deepEqual(graphql.describe('garbage'), { type: '', name: null, fields: [], multiple: false });
  assert.equal(graphql.label({ name: 'X', fields: [] }), 'X');
  assert.equal(graphql.label({ name: null, fields: ['a'] }), '{ a }');
  assert.equal(graphql.label({ name: null, fields: ['a', 'b'] }), '{ a, … }');
  assert.equal(graphql.label({ name: null, fields: [] }), '');
});

test('print: a minified document becomes the usual layout', () => {
  assert.equal(graphql.print('query AppQuery($id:ID!){node(id:$id){__typename ...on User{name repositories(first:5){edges{node{id name}}}}id}}'), [
    'query AppQuery($id: ID!) {',
    '  node(id: $id) {',
    '    __typename',
    '    ... on User {',
    '      name',
    '      repositories(first: 5) {',
    '        edges {',
    '          node {',
    '            id',
    '            name',
    '          }',
    '        }',
    '      }',
    '    }',
    '    id',
    '  }',
    '}',
  ].join('\n'));
  assert.equal(graphql.print('{a b{c}d}'), '{\n  a\n  b {\n    c\n  }\n  d\n}');
  assert.equal(graphql.print('query($a:Int){b(x:$a)}'), 'query ($a: Int) {\n  b(x: $a)\n}');
});

test('print: arguments, values, defaults, directives, aliases, spreads, comments', () => {
  assert.equal(graphql.print('query Q($a: Int = 1, $b: [String!]! = ["x", "y"]) { alias: field(arg: {a: 1, b: [1, 2], c: {d: ENUM, e: null}}, other: [{x: 1}, {x: 2}]) @include(if: $a) @skip(if: false) { x } ... on T { y } ...F }\n# trailing\nfragment F on T { z }'), [
    'query Q($a: Int = 1, $b: [String!]! = ["x", "y"]) {',
    '  alias: field(arg: {a: 1, b: [1, 2], c: {d: ENUM, e: null}}, other: [{x: 1}, {x: 2}]) @include(if: $a) @skip(if: false) {',
    '    x',
    '  }',
    '  ... on T {',
    '    y',
    '  }',
    '  ...F',
    '}',
    '# trailing',
    '',
    'fragment F on T {',
    '  z',
    '}',
  ].join('\n'));
  assert.equal(graphql.print('mutation M { like(input: {id: "x", n: -1.5e3, ok: true}) { ok } }'), 'mutation M {\n  like(input: {id: "x", n: -1.5e3, ok: true}) {\n    ok\n  }\n}');
  assert.equal(graphql.print('{ b(x: """multi\nline""") }'), '{\n  b(x: """multi\nline""")\n}');
});

test('print is idempotent and survives garbage', () => {
  for (const src of ['query A { a } query B { b }', 'subscription S($r: ID!) { m(room: $r) { id } }', 'not graphql { ok', '', '{']) {
    const once = graphql.print(src);
    assert.equal(graphql.print(once), once, src);
  }
  assert.equal(graphql.print('query A { a } query B { b }'), 'query A {\n  a\n}\n\nquery B {\n  b\n}');
  assert.equal(graphql.print(''), '');
});
