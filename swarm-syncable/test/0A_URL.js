"use strict";
let tape = require('tap').test;
let swarm = require('swarm-protocol');
let URL = require('../src/URL');

tape ('syncable.0A.A OpStream URL - basic syntax', function (t) {

    const url1 = new URL('ws://host.com:1234/path?query#hash');
    t.equals(url1.scheme,"ws");
    t.equals(url1.host,"host.com:1234");
    t.equals(url1.hostname,"host.com");
    t.equals(url1.port,1234);
    t.equals(url1.path,"/path");
    t.equals(url1.search,"query");
    t.equals(url1.hash,"hash");
    //t.equals(url1.,"");
    t.end();

});