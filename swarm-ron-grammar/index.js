"use strict";
const resolve = require('regular-grammar');

const RON_GRAMMAR = {

    BASE64:     /[0-9A-Za-z_~]/,
    UNICODE:    /\\u[0-9a-fA-F]{4}/,
    INT:        /([\([{}\])])?($BASE64{0,10})/,
    UUID:       /([`\\|\/])?($INT)([-+$%])?($INT)/,

    INT_ATOM:   /[+-]?\d{1,17}/,
    STRING_ATOM:/"($UNICODE|\\.|[^"\\])*"|'($UNICODE|\\.|[^'\\])*'/,
    FLOAT_ATOM: /[+-]?\d{0,19}\.\d{1,19}([Ee][+-]?\d{1,3})?/,
    UUID_ATOM:  /(?:($UUID),?)+/,
    FRAME_ATOM: /!/,
    QUERY_ATOM: /\?/,

    ATOM:       /=($INT_ATOM)|($STRING_ATOM)|\^($FLOAT_ATOM)|>($UUID_ATOM)|($FRAME_ATOM)|($QUERY_ATOM)/,
    OP:         /\s*\.?($UUID)\s*#?($UUID)\s*@?($UUID)\s*:?($UUID)\s*((?:$ATOM){1,8})/,
    FRAME:      /($OP)+/,

}

resolve("FRAME", RON_GRAMMAR);

module.exports = RON_GRAMMAR;
