"use strict";
const API = require('./index');
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const de = assert.deepEqual;

const upstream = [];
const downstream = [];
// local *->json mapping
const local = new API(
    { on: f=>upstream.push(f.toString()) },
    { localize: true }
    );

local.on("#test?!", downstream);
eq(upstream[0], "#test?!");
local.update(".lww#test@time-orig!:key=1:ref>refd");
eq(downstream.length,0);
local.update(".lww#refd@time2-orig!:in=2");
eq(downstream[0],
    '.JSON#test@time-orig!:body\'{"key":1,ref:{"in":2}}\'');


const up=[], dn=[];
const remote = new API( { on: f=>up.push(f) } );
const json_parts =
    '.json#root@time1-orig!:body\'{"a":1,"b":"2","c":{"$":1}}\':refs>>nested' +
    '.json#nested@time1-orig!:body\'{"d":1.0e6}\'';
const json_joined =
    '.JSON#root@time-orig!:body\'{"a":1,"b":"2","c":{"d":1.0e6}}\'';

remote.on(".JSON#root?!", {update: f=>dn.push(f)} );
eq(up[0], "#root?!");
remote.recv(json_parts);
eq(up.length, 1); // no additional queries
eq(dn[0], json_joined);

/*
 const raw =
 '.lww#root@time1-orig!:a=1:b"2":c>>nested'+
 '.lww#nested@time-orig!:d^1.0e6'+
 '';

 const js =
 '.js#root@time1-orig!:body\'{"a":1,"b":"2","c":{"$":1}}\':refs>>nested' +
 '.js#nested@time1-orig!:body\'{"d":1.0e6}\'';

 const json = '.js#root@time-orig!:body\'{"a":1,"b":"2","c":{"d":1.0e6}}\'';


*/