"use strict";
var bat = require('../bat-api');
const su = require('stream-url');
var tap = require('tape').test;

tap ('1.A parse trivial .batt scripts', function (t) {

    // parse a .batt string
    var script = new bat.BatScript(
        ">test\n"+
        "test"
    );

    t.equals(1, script.size);

    var json = script.rounds;
    t.deepEquals(json, [{
        comment: "",
        input: {default: "test\n"},
        output: {default: "test\n"}
    }]);

    var string = script.toString();
    t.equals(string, "> test\ntest\n");

    t.end();

});

// Unit test + example + API doc.
// For the philosophy see
//    https://twitter.com/peterbourgon/status/758238972145459200
tap ('1.B typical use cases', function (t) {

    var echo = new bat.BatScript([
        ">one",
        "one",
        ">two",
        "<two",
        "default>three",
        "default<tree",
        ">skip 4",
        "skipped"
    ].join('\n'));

    // bind a loopback echo server
    su.listen('0://1B', (err, server) => {
        server.on('connection', stream =>
            stream.on('data', data =>
                stream.write(data)
            )
        );
    });

    new bat.StreamTest(echo, '0://1B').run( (err, result) => {

        t.notOk(result.every(r=>r.ok));
        t.equal(result.length, 3);

        t.ok(result[0].ok);
        t.deepEquals(result[0].diff, [[0, "one\n"]]);
        t.ok(result[1].ok);
        t.deepEquals(result[1].diff, [[0, "two\n"]]);
        t.notOk(result[2].ok);
        t.deepEquals(result[2].diff, [[0, "t"], [-1, "h"], [0, "ree\n"]]);

        t.end();
    });
});


tap ('1.C options', function (t) {
    var echo = new bat.BatScript([
        "; upper->lower",
        ">TOO BIG",
        "<too big",
        "; lower -> upper",
        ">too small",
        "Too small",
        "; reordering",
        "> size does matter",
        ">after all",
        "after all",
        "size does matter"
    ].join("\n"), {
        ignoreCase: true,
        collapseWhitespace: true,
        anyOrder: true
    });

    su.listen('0://1C', (err, server) => {
        server.on('connection', stream =>
            stream.on('data', data =>
                stream.write(data)
            )
        );
    });

    new bat.StreamTest(echo, '0://1C').run( (err, res) => {

        t.equals(res.length, 3);
        t.equals(res[2].comment, "reordering");
        t.ok(res.every(r=>r.ok));
        t.end();

    });

});

/*
tap ('1.D recording mode', function (t) {

    var upper = new bat.BatScript([
        ">echo!",
        ""
    ].join("\n"), {
        record: true
    });

    var uppercase = new bat.LoopbackStream();
    uppercase.pair.on('data', function (str) {
        uppercase.pair.write(str.toUpperCase());
    });

    upper.run(uppercase, result => {

        t.equals(1, result.length);
        t.ok(result[0].ok);
        t.equals(">echo!\nECHO!\n", t.toString());
        t.end();

    });


});
*/

tap ('1.E JSON and script format normalization', function (t) {

    // a test script may be supplied as a JSON of a rather
    // relaxed format
    var json = [
            {
                comment: "simple default-stream exchange",
                input: "input to feed",
                output: "<>expected output"
            },
            {
                comment: "a new stream, multiline exchange",
                input: {
                    "stream2": "one line of input"
                },
                output: {
                    stream2: [
                        "expected output 1",
                        "expected output 2"
                    ]
                }
            },
            {
                comment: "concurrent multistream i/o",
                input: {
                    default: "input to the default stream",
                    stream2: "input to another stream"
                },
                output: {
                    default:
                        "response line 1 (trailing space) \n"+
                        " response line 2 (leading space)",
                    stream2: "single-line response"
                }
            }
        ];

    // the JSON above is an equivalent of the following script:
    var script = 
          "; simple default-stream exchange"    + '\n' +
          "> input to feed"                     + '\n' +
          "< <>expected output"                 + '\n' +
          "; a new stream, multiline exchange"  + '\n' +
          "stream2> one line of input"          + '\n' +
          "stream2< expected output 1"          + '\n' +
          "stream2< expected output 2"          + '\n' +
          "; concurrent multistream i/o"        + '\n' +
          "> input to the default stream"       + '\n' +
          "stream2> input to another stream"    + '\n' +
          "response line 1 (trailing space) "   + '\n' +
          " response line 2 (leading space)"    + '\n' +
          "stream2< single-line response"       + '\n';

    var parsed = new bat.BatScript(json);

    t.equals(parsed.toString(), script);

    // note that the script format allows for some liberties, e.g.

    var non_normalized =
        "; simple default-stream exchange"    + '\n' +
        // unnecessary stream id, no separator space
        "default>input to feed"               + '\n' +
        // no separator space, <> in the body
        "<<>expected output"                  + '\n' +
        // no separator space
        ";a new stream, multiline exchange"   + '\n' +
        // stream declaration line TODO
        //"stream2>"                            + '\n' +
        // separator tab
        "stream2>\tone line of input"         + '\n' +
        "stream2< expected output 1"          + '\n' +
        // no separator space
        "stream2<expected output 2"           + '\n' +
        // untrimmed comment
        "; concurrent multistream i/o "       + '\n' +
        "> input to the default stream"       + '\n' +
        "stream2> input to another stream"    + '\n' +
        // default mark
        "<response line 1 (trailing space) "  + '\n' +
        // separator space + leading space
        "<  response line 2 (leading space)"  + '\n' +
        // newline is missing
        "stream2< single-line response";

    var normalized = new bat.BatScript(non_normalized);

    t.equals(normalized.toString(), script);

    t.end();

});
