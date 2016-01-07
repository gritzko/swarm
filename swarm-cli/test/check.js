'use strict';
var Swarm = require('swarm-client');

var id = process.env.ID;

console.log('id read:', id);

var alice = Swarm.get(id, function(){
    console.log('object read:', this);
    process.exit( this.name==='Alice' ? 0 : 1 );
});
