"use strict";
var bat = require('../bat-api');

var tape = require('tap').test;

tape ('1.A parse trivial .batt scripts', function (t) {

    var script = new bat.BatScript(
        ">test\n"+
        "test"
    );

    t.equals(1, script.size);

    var json = script.toJSON();
    t.deepEquals([{comment: null, input: "test", output: "test"}], json);

    var string = script.toString();
    t.equals(">test\ntest\n", string);

    var comment = script.listLines(0, "comment");
    t.equals(0, comment.length);

    var input = script.listLines(0, "input");
    t.deepEquals([["default", "test"]], input);

    var output = script.listLines(0, "output");
    t.deepEquals([["default", "test"]], output);

    t.end();

});
