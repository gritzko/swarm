"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Host = require('../lib/Host');
var Text = require('../lib/Text');
var Storage = require('../lib/Storage');


test('4._ diff', function (test){
    var eq = Text.diff('same','same');
    deepEqual(eq,[['=','same']]);
    var ch = Text.diff('was','now');
    deepEqual(ch,[['+','now'],['-','was']]);
    var mid = Text.diff('muddle','middle');
    deepEqual(mid,[['=','m'],['+','i'],['-','u'],['=','ddle']]);
});

var storage = new Storage(false);
var host04 = new Host('gritzko',0,storage);
host04.availableUplinks = function () {return [storage];};

test('4.a init', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost = host04;

    var text = new Text();
    text.set('test');
    equal(text.text,'test');
});

test('4.b in rm', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost = host04;

    var text = new Text();

    text.set("tesst");
    text.set("tet");
    text.set("text");

    equal(text.text,'text');
    equal(text.weave,'\ntexs\u0008s\u0008t');

    text.set('terminator model t');
    equal(text.text,'terminator model t');
});

test('4.c concurrent insert', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost = host04;

    var text = new Text('ALE');
    text.deliver ( new Spec("/Text#ALE!00001+gritzko.insert"), { '00000+swarm': 'a' });
    text.deliver ( new Spec("/Text#ALE!00003+gritzko~1.insert"), { '00001+gritzko' : 'l' });
    text.deliver ( new Spec("/Text#ALE!00002+gritzko~2.insert"), { '00001+gritzko' : 'e' });
    equal(text.text,'ale');


});
