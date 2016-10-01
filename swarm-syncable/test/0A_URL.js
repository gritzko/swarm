"use strict";
let tape = require('tap').test;
let swarm = require('swarm-protocol');
let URL = require('../src/URL');

tape ('syncable.0A.A OpStream URL - basic syntax', function (t) {

    const url_str = 'ws://host.com:1234/path?query#hash';
    const url1 = new URL(url_str);
    t.equals(url1.protocol,"ws");
    t.equals(url1.host,"host.com:1234");
    t.equals(url1.hostname,"host.com");
    t.equals(url1.port,1234);
    t.equals(url1.path,"/path");
    t.equals(url1.search,"query");
    t.equals(url1.hash,"hash");
    //t.equals(url1.,"");

    t.equals(url1.toString(), url_str);

    t.end();

});

tape ('syncable.0A.B OpStream URL - scheme nesting', function (t) {

    const url = new URL('swarm+fs+ws://host.com:1234/path?query#hash');
    t.equals(url.protocol,"swarm+fs+ws");
    t.deepEquals(url.scheme, ["swarm","fs", "ws"]);

    url.scheme.shift();
    url.hash = undefined;
    t.equals(url.toString(), 'fs+ws://host.com:1234/path?query');

    t.ok( url.eq(url.clone()) );

    t.end();

});
