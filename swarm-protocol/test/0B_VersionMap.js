"use strict";
const tape = require('tape').test;
const swarm = require('swarm-protocol');
const Id = swarm.Id;
const VersionMap = swarm.VersionMap;

tape ('protocol.0B.1 version map ser/deser', function (t) {

    const map = new VersionMap();
    map.set("000", "x");
    map.set("~000", "x");
    map.set(Id.ZERO, Id.NEVER);
    map.set(Id.NEVER, Id.ZERO);

    t.equal(map.toString(), "#0#~@~@0");

    const deser = VersionMap.fromString(map.toString());

    t.equal(deser.get(Id.ZERO)+'', Id.NEVER+'');
    t.equal(deser.get(Id.NEVER)+'', Id.ZERO+'');

    t.end();

});