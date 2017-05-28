"use strict";
const tape = require('tape').test;
const RON_GRAMMAR = require('../src/Grammar');


tape ('protocol.01.A parse RON', function (tap) {

    tap.ok( RON_GRAMMAR.is( "time01", "INT" ) );
    tap.ok( RON_GRAMMAR.is( "{1", "ZIP_INT" ) );
    tap.ok( RON_GRAMMAR.is( "]", "ZIP_INT" ) );
    tap.ok( RON_GRAMMAR.is( "", "ZIP_INT" ) );
    tap.ok( RON_GRAMMAR.is( "0", "UUID" ) );
    tap.ok( RON_GRAMMAR.is( "time0123-origin", "UUID" ) );
    tap.ok( RON_GRAMMAR.is( "lww", "UUID" ) );
    tap.ok( RON_GRAMMAR.is( "(0123-origin", "ZIP_UUID" ), "prefix-compressed UUID" );
    tap.ok( RON_GRAMMAR.is( "[]A", "ZIP_UUID" ) );
    tap.ok( RON_GRAMMAR.is( "[-", "ZIP_UUID" ) );
    tap.ok( RON_GRAMMAR.is( "-", "ZIP_UUID" ) );

    tap.notOk( RON_GRAMMAR.is( "\\[]", "ZIP_INT" ) );
    tap.notOk( RON_GRAMMAR.is( "@", "INT" ) );
    tap.notOk( RON_GRAMMAR.is( "", "INT" ) );
    tap.notOk( RON_GRAMMAR.is( "1234567890Z", "INT" ) );
    tap.notOk( RON_GRAMMAR.is( "--", "ZIP_UUID" ) );
    tap.notOk( RON_GRAMMAR.is( "-0", "UUID" ) );

    tap.ok( RON_GRAMMAR.is( "@0", "SPEC" ) );
    tap.ok( RON_GRAMMAR.is( ".lww#1D4ICC-XU5eRJ@1D4ICCE-XU5eRJ:keyA", "SPEC" ) );
    tap.ok( RON_GRAMMAR.is( "#0@0", "SPEC" ) );
    tap.notOk( RON_GRAMMAR.is( "", "SPEC" ) );
    tap.notOk( RON_GRAMMAR.is( "123", "SPEC" ) );
    tap.notOk( RON_GRAMMAR.is( "#1.2", "SPEC" ) );

    tap.ok( RON_GRAMMAR.is( "@0", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( ".lww#1D4ICC-XU5eRJ@1D4ICCE-XU5eRJ:keyA", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( ".lww#1D4ICC-XU5eRJ@\\{E\\:keyA", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( "#{}\\[{((", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( "#0@0", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( "@", "ZIP_SPEC" ) );
    tap.ok( RON_GRAMMAR.is( "123", "ZIP_SPEC" ) );
    tap.notOk( RON_GRAMMAR.is( "#1.2", "ZIP_SPEC" ) );
    tap.notOk( RON_GRAMMAR.is( "#{}\\[{(((", "ZIP_SPEC" ) );

    tap.ok( RON_GRAMMAR.is( "0", "INT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "9007199254740991", "INT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "-9007199254740991", "INT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "+1024", "INT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "9223372036854775807", "INT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "+-0", "INT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "z", "INT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "", "INT_ATOM" ) );

    tap.ok( RON_GRAMMAR.is( '""', 'STRING_ATOM' ) );
    tap.ok( RON_GRAMMAR.is( '"кни́га\u0020도서"', 'STRING_ATOM' ) );
    tap.ok( RON_GRAMMAR.is( '"This package creates regex parsers for simple regular grammars. That is mostly valuable to implement various text-based protocols, serialization formats and smallish languages."', 'STRING_ATOM' ) );
    tap.ok( RON_GRAMMAR.is( '"\\""', 'STRING_ATOM' ) );
    tap.notOk( RON_GRAMMAR.is( '"""', 'STRING_ATOM' ) );
    tap.notOk( RON_GRAMMAR.is( '"', 'STRING_ATOM' ) );
    tap.notOk( RON_GRAMMAR.is( 'a', 'STRING_ATOM' ) );
    tap.notOk( RON_GRAMMAR.is( '"open', 'STRING_ATOM' ) );

    tap.ok( RON_GRAMMAR.is( "3.141592", "FLOAT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "-1", "FLOAT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "1.024e+3", "FLOAT_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "1e6", "FLOAT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "1e", "FLOAT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "e1", "FLOAT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "-e", "FLOAT_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "1.2.3", "FLOAT_ATOM" ) );


    tap.ok( RON_GRAMMAR.is( "1 2 3", "UUID_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "0", "UUID_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "1D4ICC-XU5eRJ\\{E\\", "UUID_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "1D4ICC-XU5eRJ time-orig\\{E\\", "UUID_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "", "UUID_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "123-orig\n", "UUID_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "#0", "UUID_ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "'", "UUID_ATOM" ) );

    tap.ok( RON_GRAMMAR.is( "!", "ATOM" ), "reducer marker" );
    tap.ok( RON_GRAMMAR.is( "?", "ATOM" ), "query marker" );
    tap.ok( RON_GRAMMAR.is( "?", "QUERY_ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "!", "FRAME_ATOM" ) );

    tap.ok( RON_GRAMMAR.is( "=1", "ATOM" ) );
    tap.ok( RON_GRAMMAR.is( ">", "ATOM" ) );
    tap.ok( RON_GRAMMAR.is( ">0", "ATOM" ), "null pointer" );
    tap.ok( RON_GRAMMAR.is( ">1-2{}", "ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "^3.1415", "ATOM" ) );
    tap.ok( RON_GRAMMAR.is( "^1", "ATOM" ) );
    tap.ok( RON_GRAMMAR.is( '"string"', "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( ">3.1415", "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "=3.1415", "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( '>"abc"', "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "=", "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "^", "ATOM" ) );
    tap.notOk( RON_GRAMMAR.is( "==", "ATOM" ) );

    tap.ok( RON_GRAMMAR.is( '.lww#1D4ICC-XU5eRJ@|{E|:keyA"value\\u0041"', "ZIP_FRAME" ) );
    tap.ok( RON_GRAMMAR.is(
        ' .lww#1D4ICC-XU5eRJ @||{E!\n:keyA "value\\u0041"\n\n', "ZIP_FRAME"
    ), "well-compressed frame" );
    tap.ok( RON_GRAMMAR.is( '.lww#1D4ICC-XU5eRJ@1D4ICCE|! @{2:keyA"valueA" @{E:keyB"valueB"', "ZIP_FRAME" ) );
    tap.ok( RON_GRAMMAR.is( "@1D4ICC-XU5eRJ?", "ZIP_FRAME" ) );
    tap.ok( RON_GRAMMAR.is( "?", "ZIP_FRAME" ) );
    tap.notOk( RON_GRAMMAR.is( "", "ZIP_FRAME" ) );
    tap.notOk( RON_GRAMMAR.is(
        ' .lww#1D4ICC-XU5eRJ @||{E!\n:keyA "value\\u0041"\n\n', "ZIP_OP"
    ), "a frame of two ops is not an op" );

    /*
    tap.ok( RON_GRAMMAR.is( "", "" ) );
    tap.notOk( RON_GRAMMAR.is( "", "" ) );
    */

    tap.end();

});