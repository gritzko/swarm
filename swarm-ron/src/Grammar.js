"use strict";
const Grammar = require('regular-grammar');

const RON_GRAMMAR = new Grammar({

    BASE64:     /[0-9A-Za-z_~]/,
    INT:        'BASE64{1,10}',
    BRACKET:    /[\([{}\])]/,
    ZIP_INT:    "BRACKET? INT?",
    UUID:       "INT -INT?",
    ZIP_UUID:   "[`\\\\\\|\\/]?ZIP_INT -?ZIP_INT?",

    INT_ATOM:   /[+-]?\d{1,17}/,
    STRING_ATOM:/"(\\"|[^"])*"/,
    FLOAT_ATOM: /[+-]?\d{0,19}\.\d{1,19}([Ee][+-]?\d{1,3})?/,
    UUID_ATOM:  ",?ZIP_UUID+",
    FRAME_ATOM: "!",
    QUERY_ATOM: "?",
    ATOM:       "=INT_ATOM| STRING_ATOM| ^FLOAT_ATOM| >UUID_ATOM| FRAME_ATOM| QUERY_ATOM",

    OP:         ".UUID? #UUID? @UUID :UUID? ATOM{1,8}",
    ZIP_OP:     ".?ZIP_UUID? #?ZIP_UUID? @?ZIP_UUID? :?ZIP_UUID? ATOM{1,8}",
    FRAME:      "OP+",
    ZIP_FRAME:  "ZIP_OP+",

});
// TODO reserve [-+%*] as UUID seps, use a separate capture group for non-trivial markers

module.exports = RON_GRAMMAR;

