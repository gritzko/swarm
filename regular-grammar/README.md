# Simple regular grammar parser generator

This package creates regex parsers for simple regular grammars.
That is mostly valuable to implement various text-based
protocols, serialization formats and smallish languages.

We only support *regular* grammars, so for example,
arbitrarily-deep nesting and recursion are not possible.
But, by the Chomsky–Schützenberger hierarchy,
the next degree of sophistication is a context-free language, which is
probably too much for our use case.
After all, our goal is simplicity and predictability, not Turing completeness.

In particular, you may create parsers for reasonably functional subsets of SMTP, HTTP, or CSS.
You can't create a parser for general-case HTML, XML, or JSON. Those languages have arbitrarily deep nesting.
Still, you can create a parser for a subset of such a language (see the JSON example).

Advantages of the approach are:

* simple languages,
* uniform treating of whitespace and punctuation,
* correct formal parsers created in 5 minutes.

## Examples

(see `test/`)

```js
const THREE_WORD = new Grammar({
    WORD:     /\w+/,
    SENTENCE: ' WORD{1,3} ',
});

tap.ok(THREE_WORD.is('what a grammar', 'SENTENCE'));
tap.ok(THREE_WORD.is('attention', 'SENTENCE'));
tap.notOk(THREE_WORD.is('you talk too much', 'SENTENCE'));
tap.notOk(THREE_WORD.is(' ', 'SENTENCE'));

const words = THREE_WORD.split(' exactly three\nwords', 'SENTENCE');
tap.deepEqual(words, [['exactly', 'three', 'words']]);
```

## Why not JSON?

JSON is an expensive to parse language that gives no guarantees
about the structure of the resulting objects. It is lax.
A parsed JSON object will have to be parsed anew
to derive *your* data structures.
In fact, it is possible to define restricted JSONey languages
using regular grammars.

```js
const INVENTORY_JSON = new Grammar({
    FLOAT: /\d{1,16}(\.\d{1,15})?/,
    INT:   /\d{1,16}/,
    STRING: /"(\\.|[^"])*"/,
    IDKV:  '"\\"id\\"" :STRING',
    NAMEKV:'"\\"name\\"" :STRING',
    QUANTKV:'"\\"quantity\\"" :INT',
    PRICEKV:'"\\"price\\"" :FLOAT',
    ENTRY: '{ IDKV ,NAMEKV? ,QUANTKV? ,PRICEKV? }',
    LIST:  '[ ENTRY ,ENTRY* ]'
});

// This particular language can be parsed by a JSON parser,
// but it is way more strict than JSON.
// Field names, their order and value types are all fixed.

tap.ok( INVENTORY_JSON.is( '{"id":"A123"}', 'ENTRY' ) );
tap.ok(INVENTORY_JSON.is(''+Math.PI, 'FLOAT'));
const bears = '{"id":"A345", "name":"teddy bear", "price": 5.45}';
tap.ok( INVENTORY_JSON.is(bears, 'ENTRY') );
tap.notOk(INVENTORY_JSON.is('{"id":123}', 'ENTRY'));
```

For that JSONey grammar, the parser looks like:
```
/^\s*\[\s*(\{\s*(?:(?:"id"\s*)\:\s*(?:"(?:\\.|[^"])*"))\s*(?:\,\s*(?:(?:"name"\s*)\:\s*(?:"(?:\\.|[^"])*")))?\s*(?:\,\s*(?:(?:"quantity"\s*)\:\s*(?:\d+)))?\s*(?:\,\s*(?:(?:"price"\s*)\:\s*(?:\d+(?:\.\d{1,15})?)))?\s*\}\s*)((?:\,\s*\{\s*(?:(?:"id"\s*)\:\s*(?:"(?:\\.|[^"])*"))\s*(?:\,\s*(?:(?:"name"\s*)\:\s*(?:"(?:\\.|[^"])*")))?\s*(?:\,\s*(?:(?:"quantity"\s*)\:\s*(?:\d+)))?\s*(?:\,\s*(?:(?:"price"\s*)\:\s*(?:\d+(?:\.\d{1,15})?)))?\s*\}\s*)*)\s*\]\s*\s*$/m
```

## Historical note

The package was initially made to parse a new version of the Swarm
protocol. The protocol gradually evolved since circa 2012, parsers
became more and more hairy with no obvious guarantees of correctness,
security or performance.
A formal grammar saved the day by describing the protocol in about
a dozen simple rules and producing a provably correct parser of
a reasonable performance.
