"use strict";

let IM ='abcdefgh';
for(let i=0; i<20; i++)
    IM = IM+IM;

const re = /abcdefgh/g;
//let c = 0, m;
//while ( m=re.exec(IM) )
//    c++;

const m = IM.match(re);

console.log(m.length);
