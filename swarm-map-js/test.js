"use strict";
const map = require('./index');
const de = require('assert').deepEqual;

const array_ron = "*lww#array@2!@1:~%=0@2:%1'1':%2=1:%3=2:%4>notexists";
de(map(array_ron), Object.assign(JSON.parse('[0,"1",1,2,{"$ref":"notexists"}]'), {_id: "array"}));

const array_ron_2 = "*lww#array@2!@1:~%=0@2:%4>notexists:%1'1':%2=1:%3=2";
de(map(array_ron_2), Object.assign(JSON.parse('[0,"1",1,2,{"$ref":"notexists"}]'), {_id: "array"}));

const object_ron = "*lww#obj@2:d!:a'A2':b'B2'@1:c'C1'"
de(map(object_ron), JSON.parse('{"a":"A2","b":"B2","c":"C1","_id":"obj"}'));

const array_ref = "*lww#ref@t-o!:~%=1:%1=2:%2>arr";
de(map(array_ref), Object.assign(JSON.parse('[1,2,{"$ref":"arr"}]'), {_id: "ref"}));

const lww = "*lww#test@time-orig!:key=1:obj>time1-orig";
de(map(lww), JSON.parse('{"key":1,"obj":{"$ref":"time1-orig"},"_id":"test"}'));

const array_no = "*lww#ref@t-o!:key>arr:~%=1:~%1=2";
de(map(array_no), JSON.parse('{"0":1,"1":2,"key":{"$ref":"arr"},"_id":"ref"}'));


const with_refs = `
*lww#root@1! :one>left :two>right 
#left@2! :key'value'
#right@3! :number=42
 .
`
de(map(with_refs), JSON.parse('{"one":{"key":"value","_id":"left"},"two":{"number":42,"_id":"right"},"_id":"root"}'));
