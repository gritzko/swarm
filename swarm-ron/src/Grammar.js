"use strict";
const Grammar = require('regular-grammar');

const RON_GRAMMAR = new Grammar({

    BASE64:     /[0-9A-Za-z_~]/,
    INT:        'BASE64{1,10}',
    BRACKET:    /[([{}\])]/,
    REDEFAULT:  /[\\\|\/]/,
    ZIP_INT:    "REDEFAULT? BRACKET? INT?",
    UUID:       "INT -INT?",
    ZIP_UUID:   "ZIP_INT /-?/ZIP_INT?",
    SPEC:       ".UUID? #UUID? @UUID :UUID?",
    ZIP_SPEC:   "/[.]?/ZIP_UUID? /#?/ZIP_UUID? /@?/ZIP_UUID? /:?/ZIP_UUID?",

    INT_ATOM:   /[+-]?\d{1,17}/,
    STRING_ATOM:/"(\\"|[^"])*"/,
    FLOAT_ATOM: /[+-]?\d{1,19}(\.\d{1,19})?([Ee][+-]?\d{1,3})?/,
    UUID_ATOM:  "ZIP_UUID+",
    FRAME_ATOM: "!",
    QUERY_ATOM: "?",
    ATOM:       "=INT_ATOM| STRING_ATOM| ^FLOAT_ATOM| >UUID_ATOM| FRAME_ATOM| QUERY_ATOM",

    OP:         "SPEC ATOM+",
    ZIP_OP:     "ZIP_SPEC ATOM+",
    FRAME:      "OP+",
    ZIP_FRAME:  "ZIP_OP+",

});

module.exports = RON_GRAMMAR;