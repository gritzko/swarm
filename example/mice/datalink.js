

var app = app || {};

(function () {
    'use strict';
    Swarm.debug = true;

    app.id = window.localStorage.getItem('.localuser') || 
        'anon'+Spec.int2base((Math.random()*10000)|0);
    window.localStorage.setItem('.localuser',app.id);
    
    app.wsServerUri = 'ws://localhost:8000'; // FIXME

    var hash = window.location.hash || '#0';
    // create Host
    app.host = Swarm.localhost = new Swarm.Host(app.id+hash.replace('#','~'));
    
    // create a Mouse object
    var mickey = app.mouse = new Mouse(app.id);

    app.mice = app.host.get('/Mice#mice');
    // open #mice, list our object
    app.mice.on('.init', function (spec, mice_pojo, mice) {
        // TODO no need to wait, actually
        // ...bit writing to stateless objects is "bad"
    });
    // connect to server
    app.host.connect(app.wsServerUri);

    {//show online/offline status //TODO move it to mice-view
        app.host.on('reon', function (spec, val) {
            //console.log('CONNECTED: ', spec.toString(), val);
            document.body.setAttribute('connected', 'true');
        });
        app.host.on('off', function (spec, val) {
            //console.log('DISCONNECTED: ', spec.toString(), val);
            document.body.setAttribute('connected', 'false');
        });
    }

    window.onbeforeunload = function(e) {
        app.mice.removeObject(mickey);
        app.host.close();
    };
    
    var ssn = app.id.match(/anon([\w~_]+)/)[1]; // FIXME ugly
    var ssnInt = Spec.base2int(ssn);

    mickey.set({
        x:40,
        y:80,
        symbol: String.fromCharCode(10000+ssnInt%60) // dingbats
    });

    app.mice.addObject(mickey);

})();
