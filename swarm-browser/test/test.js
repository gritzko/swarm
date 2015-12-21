'use strict';
var Swarm = require('../'); //('swarm-browser');

var app = window.app = {};

app.db = Swarm.DB('test')
app.db.open(function(){
    console.log('open', arguments);
    start_client();
});

function start_client () {
    app.client = new Swarm.Client({
        db_id:  'test',
        ssn_id: 'test',
        connect: 'ws://localhost:10000',
//        empty_db: true,
        db:     app.db
    });
    console.log(app.client);
}
