"use strict";
const API = require('./index');
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const de = assert.deepEqual;
const Client = require('swarm-client');
const Clock = require('swarm-clock');

const client = new Client(new Clock('mine'));
const api = new API(client);

client.localize(UUID.fromString("json")); //?
client.update(".lww#test@time-orig!:key=1");
de(api.get("test"), {key:1});
client.update('.lww#var$mine@t-o!:str"ing":ref>test');
de(api.get("var$mine"), {str:"ing",ref:{key:1}});

let i = 0;
const json = api.on("$var", ()=>{i++}); // params?
de(json, {str:"ing",ref:{key:1}});
client.update('.lww#test@time1-orig:key=2');
eq(i,1);
de(json, {str:"ing",ref:{key:2}});

const lww = ".lww#test@time-orig!:key=1:ref>time1-orig";
const lww2json =
    '.json#test@time-orig!'+
    ':body"{\\"key\\":1,ref:{\\"$\\":1}}"'+
    ':refs>time1-orig';
eq(RDT.map("json", lww), lww2json);

"use strict";
const JsonAsm = require('./index');
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const js =
    '.js#root@time1-orig!:body\'{"a":1,"b":"2","c":{"$":1}}\':refs>>nested' +
    '.js#nested@time1-orig!:body\'{"d":1.0e6}\'';

const json = '.js#root@time-orig!:body\'{"a":1,"b":"2","c":{"d":1.0e6}}\'';

const tray = [];
const asm = new JsonAsm({on:q=>tray.push(q)});
asm.on(".json#root?!", {update: frame=>eq(json)} );
asm.update(js);

client.localize(UUID.fromString("json")); //?
client.update();
de(api.get("test"), {key:1});
client.update('.lww#var$mine@t-o!:str"ing":ref>test');
de(api.get("var$mine"), {str:"ing",ref:{key:1}});*/

let i = 0;
const json = api.on("$var", ()=>{i++}); // params?
de(json, {str:"ing",ref:{key:1}});
client.update('.lww#test@time1-orig:key=2');
eq(i,1);
de(json, {str:"ing",ref:{key:2}});

const lww = ;
const lww2json =
    '.json#test@time-orig!'+
    ':body"{\\"key\\":1,ref:{\\"$\\":1}}"'+
    ':refs>time1-orig';
eq(RDT.map("json", lww), lww2json);
