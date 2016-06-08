"use strict";
var Base64x64 = require('../src/Base64x64');

var baseZero = Base64x64.fromPair({high:0,low:0});
var numZero = Base64x64.toPair("0");
console.log(baseZero);
console.log(numZero.high+numZero.low);

console.log(Base64x64.INFINITY);
console.log("1134907106097364992");
console.log(Base64x64.fromPair({high: 63<<24, low: 1}));
console.log("1134907106097364993");
console.log("932808072819113984");
console.log("on");
console.log("932808072819113984");

for(var i=0; i<=(64*64); i++) {
    console.log(Base64x64.fromPair({high:0, low:i}));
}

