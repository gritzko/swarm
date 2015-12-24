'use strict';
var Swarm = require('swarm-server');

var host = new Swarm.Host({db_id: 'test'});
var server = Swarm.Server.local;
var replica = server.replica;


host.on('writable', function () {
    host.get('/Model#form', function init_form (ev) {
        var form = ev.target;
        console.log('FORM', form);
        if (form._version==='0') { // not initialized yet
            form.set({
                voice: 1,
                comment: 'checking the microphone'
            });
        }
    });
});

replica.addOpStreamDown(host);
