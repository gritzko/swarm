const tap = require('tape');
const Grammar = require('..');

const SWARM_GRAMMAR_RULES = { // swarm 1.9.99 grammar :)

    NUMBER: /\d+(\.\d+([eE]-?\d+)?)?/,
    STRING: /"(\\.|[^"])*"/,
    EMPTY: '',
    BASE: /[0-9A-Za-z_~]+/,
    INT: /[0-9A-Za-z_~]{1,10}/,

    ID: 'INT [+%-]INT?',
    SPEC: 'ID? .ID? @ID? :ID?',
    CONSTANT: 'NUMBER| STRING| >ID| EMPTY',

    RUN: 'INT /BASE? /[+%-]/INT?',
    CONSTRUN: 'CONSTANT /BASE?',
    IDS: 'RUN ,RUN*',
    CONSTANTS: 'CONSTRUN ,CONSTRUN*',
    BLOCK: '/INT? IDS? :IDS? =CONSTANTS?',
    OPS: 'BLOCK ;BLOCK* }EMPTY',

    EVENT: '#ID? .ID? @ID :ID? =CONSTANTS?',
    ON: '?ID .ID? @ID? :ID? =CONSTANTS?',
    STATE: '!ID .ID? @ID? :ID? {OPS?',

    FRAME_UP: 'ON* EVENT*',
    FRAME_DOWN: 'STATE* EVENT*',

};

const grammar = new Grammar(SWARM_GRAMMAR_RULES);

tap('grammar.01.A triplets', (tap) => {
    tap.deepEqual(grammar.triplets('ID'), [
        {
            formula: 'INT',
            empty: false,
            marker: '',
            marker_optional: false,
            rule: 'INT',
            quantifier: '',
            repeating: false,
        },
        {
            formula: '[+%-]INT?',
            empty: false,
            marker: '[+%-]',
            marker_optional: false,
            rule: 'INT',
            quantifier: '?',
            repeating: false,
        },
    ]);
    tap.end();
});

tap('grammar.01.B vanilla', (tap) => {
    tap.ok(grammar.is('1', 'NUMBER'));
    tap.ok(grammar.is('1', 'INT'));
    tap.ok(grammar.is('1', 'ID'), '1 is ID');
    tap.notOk(grammar.is('$1', 'ID'), '$1 is not ID');
    tap.ok(grammar.is('1', 'CONSTANT'));
    tap.ok(grammar.is('1.23e4', 'NUMBER'));
    tap.notOk(grammar.is('1.23e4', 'INT'));
    tap.ok(grammar.is('12.3E-4', 'SPEC'));
    tap.notOk(grammar.is('0+0', 'CONSTANT'));
    tap.ok(grammar.is('  0\n+0 ', 'ID'));
    tap.ok(grammar.is('0+ 0', 'ID'));
    // tap.ok( grammar.is('{a:1, b: "two " }', 'MAP'), 'the MAP type' );

    tap.end();
});

tap('grammar.01.C split', (tap) => {
    tap.deepEqual(grammar.split('1+1', 'ID'), ['1', '+1']);
    tap.deepEqual(grammar.split('1+1 :2-2', 'SPEC'), ['1+1', undefined, undefined, '2-2']);
    tap.deepEqual(grammar.split('1+1.0 :2-2', 'SPEC'), ['1+1', '0 ', undefined, '2-2']);
    tap.deepEqual(grammar.split('"string"', 'CONSTANT'), [undefined, '"string"', undefined, undefined]);
    tap.deepEqual(grammar.split('1+1,2+2,3+3', 'IDS'), ['1+1', ['2+2', '3+3']]);
    tap.deepEqual(grammar.split('?0#1@one=1#2@two="two",2@3:three', 'FRAME_UP'), [['?0'], ['#1@one=1', '#2@two="two",2', '@3:three']]);
    tap.end();
});

tap('grammar.01.D grammar.is', (tap) => {
    tap.deepEqual(grammar.test('').sort().join(), ['SPEC', 'EMPTY', 'CONSTANT', 'FRAME_UP', 'CONSTRUN', 'CONSTANTS', 'BLOCK', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('0').sort().join(), ['INT', 'ID', 'SPEC', 'NUMBER', 'CONSTANT', 'BASE', 'RUN', 'IDS', 'CONSTRUN', 'CONSTANTS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('1.23e4').sort().join(), ['SPEC', 'NUMBER', 'CONSTANT', 'CONSTRUN', 'CONSTANTS'].sort().join());
    tap.deepEqual(grammar.test('12.3E-4').sort().join(), ['SPEC', 'NUMBER', 'CONSTANT', 'CONSTRUN', 'CONSTANTS'].sort().join());
    tap.deepEqual(grammar.test('"some string"').sort().join(), ['STRING', 'CONSTANT', 'CONSTRUN', 'CONSTANTS'].sort().join());
    tap.deepEqual(grammar.test('0+0').sort().join(), ['ID', 'SPEC', 'RUN', 'IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('10-Z0').sort().join(), ['ID', 'SPEC', 'RUN', 'IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('Sl0v0').sort().join(), ['INT', 'ID', 'SPEC', 'BASE', 'RUN', 'IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('12345+origin').sort().join(), ['ID', 'SPEC', 'RUN', 'IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('L0Ngl0nG01%HASHHASH00').sort().join(), ['ID', 'SPEC', 'RUN', 'IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('notanumbertoolong').sort().join(), 'BASE');
    tap.deepEqual(grammar.test('  0BjeKtID +author .genfn@12time+origin:l0cat10n+origin').sort().join(), 'SPEC');
    tap.deepEqual(grammar.test(':l0cat10n').sort().join(), 'BLOCK,SPEC');
    tap.deepEqual(grammar.test('3.1415').sort().join(), ['SPEC', 'NUMBER', 'CONSTANT', 'CONSTRUN', 'CONSTANTS'].sort().join());
    tap.deepEqual(grammar.test('"string"').sort().join(), ['STRING', 'CONSTANT', 'CONSTRUN', 'CONSTANTS'].sort().join());
    tap.deepEqual(grammar.test('0/~').sort().join(), ['RUN', 'IDS', 'CONSTRUN', 'CONSTANTS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('0/~,~/0').sort().join(), ['IDS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('PREFIX/COUNT+ORIGIN').sort().join(), 'BLOCK,IDS,RUN');
    tap.deepEqual(grammar.test('1,2,3').sort().join(), ['IDS', 'CONSTANTS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('=1,2,3').sort().join(), 'BLOCK');
    tap.deepEqual(grammar.test('#object+author.json@1time\n+origin:field\n =1').sort().join(), ['EVENT', 'FRAME_UP', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('#object+author .json@1time+origin\t:field ="some so-called \\"string\\""').sort().join(), ['EVENT', 'FRAME_UP', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('#object+author.json@1time+origin:field =>another+object').sort().join(), ['EVENT', 'FRAME_UP', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('!no+changes').sort().join(), ['STATE', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('?object+author').sort().join(), ['ON', 'FRAME_UP'].sort().join());
    tap.deepEqual(grammar.test('?I?want+to@read?all%that?0bjects.now').sort().join(), 'FRAME_UP');
    tap.deepEqual(grammar.test('!object+author.json@1time+origin:0 { :one,two,three,four,five =1,2,3,"hello world" ,>object+ref}').sort().join(), 'FRAME_DOWN,STATE');
    tap.deepEqual(grammar.test(':field1="value1"; :field2=2; :field3=>some+object}').sort().join(), 'OPS');
    tap.deepEqual(grammar.test('!empty+state {}').sort().join(), ['STATE', 'FRAME_DOWN'].sort().join());
    tap.deepEqual(grammar.test('#empty+ref@time+origin =>0').sort().join(), 'EVENT,FRAME_DOWN,FRAME_UP');
    tap.deepEqual(grammar.test('#empty+constant@yester+day =').sort().join(), 'EVENT,FRAME_DOWN,FRAME_UP');
    tap.deepEqual(grammar.test('/8').sort().join(), ['CONSTRUN', 'CONSTANTS', 'BLOCK'].sort().join());
    tap.deepEqual(grammar.test('/8 :1,2,3,4,5,6,7,8 =/8').sort().join(), 'BLOCK');

    tap.end();
});

tap('grammar.01.E benchmark', (tap) => {
    const event_str = '#object+author.json@sometime+origin:field="value"\n';
    let mln_str = '';
    const ev_count = 100000;
    for (let i = 0; i < ev_count; i++) { mln_str += event_str; }
    const re_frame = grammar._parsers.FRAME_UP;
    const start_ms = new Date().getTime();
    const is_frame = re_frame.test(mln_str);
    const end_ms = new Date().getTime();
    tap.ok(is_frame);
    // TODO performance degradation, likely due to excessive bracketing
    // this should be >1MHz on a laptop
    console.log(1.0 * (end_ms - start_ms) / ev_count, 'ms or',
        1000 / (end_ms - start_ms) * ev_count / 1000000, 'MHz');

    tap.end();
});
