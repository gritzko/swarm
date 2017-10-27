const tape = require('tape');
const Grammar = require('..');


tape('grammar.02.A EMPTY', (tap) => {
    const BRCKETED = new Grammar({
        WORD: /\w+/,
        ANY: '{ WORD* }',
    });

    tap.ok(BRCKETED.is('{something}', 'ANY'));

    tap.ok(BRCKETED.is('{some thing }', 'ANY'));
    tap.ok(BRCKETED.is('{ something}', 'ANY'));
    tap.ok(BRCKETED.is('{}', 'ANY'));
    tap.ok(BRCKETED.is(' { }', 'ANY'));

    tap.notOk(BRCKETED.is(' { wo}rd', 'ANY'));
    tap.notOk(BRCKETED.is(' { word', 'ANY'));
    tap.notOk(BRCKETED.is(' word }', 'ANY'));
    tap.notOk(BRCKETED.is(' }{', 'ANY'));

    tap.end();
});

tape('grammar.02.B COUNTS', (tap) => {
    const THREE_WORD = new Grammar({
        WORD:     /\w+/,
        SENTENCE: ' WORD{1,3} ',
    });

    tap.ok(THREE_WORD.is('what a grammar', 'SENTENCE'));
    tap.ok(THREE_WORD.is(' not a word', 'SENTENCE'));
    tap.ok(THREE_WORD.is('attention', 'SENTENCE'));
    tap.notOk(THREE_WORD.is('you talk too much', 'SENTENCE'));
    tap.notOk(THREE_WORD.is(' ', 'SENTENCE'));

    const words = THREE_WORD.split(' exactly three\nwords', 'SENTENCE');
    tap.deepEqual(words, [['exactly', 'three', 'words']]);

    tap.end();
});

tape('grammar.02.C QUOTES', (tap) => {
    const CONCRETE = new Grammar({
        WORD:     /\w+/,
        SENTENCE: '"the"WORD+',
    });

    tap.ok(CONCRETE.is(' the dog', 'SENTENCE'));
    tap.ok(CONCRETE.is(' the cat the dog', 'SENTENCE'));
    tap.ok(CONCRETE.is('there', 'SENTENCE'));
    tap.notOk(CONCRETE.is('a cat', 'SENTENCE'));

    tap.end();
});

tape('grammar.02.D OR', (tap) => {
    const GEOMETRY = new Grammar({
        COLOR:     /WHITE|BLACK|RED/,
        SPHERE:    /SPHERE/i,
        CUBE:      /CUBE/i,
        SHAPE:     'SPHERE| CUBE',
        SIZE:      '"BIG"| "SMALL"',
        SENTENCE:  'COLOR| SIZE  SHAPE',
    });

    tap.ok(GEOMETRY.is('BIG SPHERE', 'SENTENCE'));
    tap.ok(GEOMETRY.is('RED SPHERE', 'SENTENCE'));
    tap.ok(GEOMETRY.is('SMALL CUBE', 'SENTENCE'));
    tap.ok(GEOMETRY.is('BIG SPHERE', 'SENTENCE'));

    tap.notOk(GEOMETRY.is('BIG BIG SPHERE', 'SENTENCE'));
    tap.notOk(GEOMETRY.is('CUBE', 'SENTENCE'));
    tap.notOk(GEOMETRY.is('SPHERE CUBE', 'SENTENCE'));

    tap.end();
});

tape('grammar.02.E BABY ENGLISH', (tap) => {
    // TODO word boundaries
    const BABY_ENGLISH = new Grammar({
        NOUN: /dog|cat|toy|mom/,
        IS:   /is|was|will be/,
        ADJECTIVE: /funny|happy|good|bad/,
        SENTENCE: 'NOUN IS ADJECTIVE',
    });

    tap.ok(BABY_ENGLISH.is('mom is good', 'SENTENCE'));
    tap.ok(BABY_ENGLISH.is('cat is bad', 'SENTENCE'));
    tap.ok(BABY_ENGLISH.is('dog was funny', 'SENTENCE'));

    tap.notOk(BABY_ENGLISH.is('cat is dog', 'SENTENCE'));
    tap.notOk(BABY_ENGLISH.is('was cat good', 'SENTENCE'));
    tap.notOk(BABY_ENGLISH.is('dog is dog', 'SENTENCE'));

    tap.end();
});

tape('grammar.03.F OPTIONAL MARKER', (tap) => {
    const WORDS = new Grammar({
        WORD: /\w+/,
        WORDS: ",?WORD+"
    });

    tap.ok(WORDS.is("some words, more words", "WORDS"));
    const words = WORDS.split("some words, more words", "WORDS");
    tap.deepEqual(words, [["some", "words", "more", "words"]] );
    console.warn(words);

    tap.end();

});
