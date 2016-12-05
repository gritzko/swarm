"use strict";
const protocol = require('..');
const Id = protocol.Id;
const Ids = protocol.Ids;
const tap = require('tape').test;


tap ('protocol.07.A builder', function(tap) {

    const b = new Ids.Builder();
    b.append(Id.ZERO);
    b.append(Id.ZERO);
    b.append(Id.ZERO);
    tap.equal(b.toString(), "@0;3");

    const b2 = new Ids.Builder();
    b2.append("ABCDEF-author");
    b2.append("ABCDGH-author");
    b2.append("ABCDIJ-author");
    b2.append("ABCDKLM-author");
    b2.append("ABCDKNO-author");
    b2.append("ABCDKN-author");
    b2.append("ABCDKNP-author");
    b2.append("ABCDKQR-author");
    b2.append("ABCDKQR-other");
    tap.equal(b2.toString(),
        "@ABCDEF-author'GHIJ@ABCDKLM-author'NON0NPQR@ABCDKQR-other"
    );

    tap.end();
});

// tap ('protocol.07.B iterator', function(tap) {
//
// });