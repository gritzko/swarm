const tape = require('tape');
const Grammar = require('..');
const Timer = require('./Timer');


tape('grammar.03.A JSON', (tap) => {

    const INVENTORY_JSON = new Grammar({
        FLOAT: /\d+(\.\d{1,15})?/,
        INT:   /\d+/,
        STRING: /"(\\.|[^"])*"/,
        IDKV:  '"\\"id\\"" :STRING',
        NAMEKV:'"\\"name\\"" :STRING',
        QUANTKV:'"\\"quantity\\"" :INT',
        PRICEKV:'"\\"price\\"" :FLOAT',
        ENTRY: '{ IDKV ,NAMEKV? ,QUANTKV? ,PRICEKV? }',
        LIST:  '[ENTRY ,ENTRY* ]'
    });

    tap.ok( INVENTORY_JSON.is( '{"id":"A123"}', 'ENTRY' ) );
    tap.ok(INVENTORY_JSON.is(''+Math.PI, 'FLOAT'));
    const bears = '{"id":"A345", "name":"teddy bear", "price": 5.45}';
    tap.ok( INVENTORY_JSON.is(bears, 'ENTRY') );
    tap.ok( INVENTORY_JSON.is('[{"id":"A"}]', 'LIST') );
    tap.notOk(INVENTORY_JSON.is('{"id":123}', 'ENTRY'));

    let mln = '[';
    const entry_count = 200;
    for(let i=1; i<entry_count; i++)
        mln += bears + ', ';
    mln += bears + ']';

    console.log('length: '+ mln.length);

    const timer = new Timer();

    timer.push('JSON.parse');
    const json = JSON.parse(mln);
    timer.pop();
    timer.push('Grammar.is');
    const is = INVENTORY_JSON.is(mln, 'LIST');
    timer.pop();
    timer.push('Grammar.split');
    const parts = INVENTORY_JSON.split(mln, 'LIST');
    timer.pop();
    tap.ok(is);
    tap.equals(parts[1].length, entry_count-1);

    tap.end();

});


tape('grammar.03.A SQL', (tap) => {
    tap.end();
});
