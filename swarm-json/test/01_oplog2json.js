"use strict";
const tape = require('tape').test;
const swarm = require('swarm-protocol');
const Id = swarm.Id;
const Op = swarm.Op;
const OpStream = swarm.OpStream;
const Json = require('../src/Json');

tape ('json.01.A simple build', function (t) {

    const ops = Op.parseFrame([
        '#id-author.json@time1-origin:~on={"s":"@time-or","l":":field","v":[1]}'
    ].join('\n')+'\n');

    const client = new OpStream.ZeroOpStream();
    client.onObject = function (id, os) { this.on(os); }; // TODO upstream
    const json = new Json("id-author", client, {});

    ops.forEach( o => json._emitted(o) );

    const j = json.json;

    t.deepEqual(j, {field:1});

    t.end();

});
