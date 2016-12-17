"use strict";
const protocol = require('..');
const Id = protocol.Id;
const Ids = protocol.Ids;
const tap = require('tape').test;

const ids1ids = [
    "ABCDEF-author",
    "ABCDGH-author",
    "ABCDIJ-author",
    "ABCDKLM-author",
    "ABCDKNO-author",
    "ABCDKN-author",
    "ABCDKNP-author",
    "ABCDKQR-author",
    "ABCDKQR-other",
    // FIXME   abc0 abde
    Id.ZERO,
    Id.ZERO,
    Id.ZERO
].map(Id.as);

const ids1str = '@ABCDEF-author"GHIJ@ABCDKLM-author"NON0NPQR@ABCDKQR-other@0,3';

// TODO weird cases:  @00'~000~0
// TODO invalid inputs

tap ('protocol.07.A builder', function(tap) {

    const b = new Ids.Builder();
    b.append(Id.ZERO);
    b.append(Id.ZERO);
    b.append(Id.ZERO);
    tap.equal(b.toString(), "@0,3");

    const b2 = new Ids.Builder();
    ids1ids.forEach(i=>b2.append(i));
    tap.equal(b2.toString(), ids1str);

    tap.end();
});

tap ('protocol.07.B iterator', function(tap) {

    const ids = new Ids(ids1str);

    const i = ids.iterator();

    ids1ids.forEach( id => {
        let next = i.nextId();
        tap.ok( id.eq(next) );
    } );

    tap.ok(i.nextId()===undefined);
    tap.ok(i.end);

    const i2 = ids.iterator();
    let countQR = 0;
    let countGH = 0;
    let count0 = 0;
    while (!i2.end) {
        if (i2.runMayHave("ABCDKQR-other")) countQR++;
        if (i2.runMayHave("ABCDKGH-author")) countGH++;
        if (i2.runMayHave(Id.ZERO)) count0++;
        i2.nextRun();
    }
    tap.equal(countQR, 1);
    tap.equal(countGH, 1);
    tap.equal(count0, 1);

    tap.end();

});

tap ('protocol.07.C splice', function(tap) {

    const arr = ids1ids.slice();
    const ids = Ids.fromString(ids1str);

    arr.splice(7, 3, [Id.NEVER]);
    const spliced = ids.splice(7, 3, [Id.NEVER]);

    tap.equal(spliced.toString(), '@ABCDEF-author"GHIJ@ABCDKLM-author"NON0NP@~"0000');

    let i = 0;
    for( var id of spliced ) {
        const idstr = arr[i++].toString();
        if ( id+'' !== idstr )
            console.log(id + '?=' + idstr );
        tap.equals( id+'', idstr );
    }

    tap.end();

});