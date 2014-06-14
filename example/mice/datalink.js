

var app = app || {};

(function () {
    'use strict';

    app.id = 'p'+((Math.random()*100)|0);  // FIXME
    app.wsServerUri = 'ws://localhost:8000'; // FIXME
    // create Host
    app.host = Swarm.localhost = new Swarm.Host(app.id);
    // create a Mouse object
    var mickey = app.mouse = new Mouse();

    app.mice = app.host.get('/Mice#mice');
    // open #mice, list our object
    app.mice.on('.init', function (spec, mice_pojo, mice) {
        // TODO no need to wait, actually
        // ...bit writing to stateless objects is "bad"
    });
    // connect to server
    app.host.connect(app.wsServerUri);
    app.host.on('reon', function (spec, val) {
        console.log('CONNECTED: ', spec.toString(), val);
    });
    app.host.on('off', function (spec, val) {
        console.log('DISCONNECTED: ', spec.toString(), val);
    });

    window.onbeforeunload = function(e) {
        app.mice.removeObject(mickey);
        app.host.close();
    };
    
    mickey.set({
        x:40,
        y:80,
        symbol: String.fromCharCode(((Math.random()*20)|0)+'a'.charCodeAt(0))
    });

    app.mice.addObject(mickey);

})();
