

var app = app || {};

(function () {
    'use strict';
    Swarm.debug = true;

    app.id = window.localStorage.getItem('.localuser') || 
        'anon'+Spec.int2base((Math.random()*10000)|0);
    window.localStorage.setItem('.localuser',app.id);
    
    app.wsServerUri = window.location.origin.replace(/^http/,'ws');

    var hash = window.location.hash || '#0';
    // create Host
    app.host = Swarm.localhost = new Swarm.Host(app.id+hash.replace('#','~'));
    
    var ssn = app.id.match(/anon([\w~_]+)/)[1]; // FIXME ugly
    var ssnInt = Spec.base2int(ssn);
    
    // create a Mouse object
    var mickey = app.mouse = new Mouse(app.id);
    mickey.on('.init',function(){
        if (this._version!=='!0') return; // FIXME default values
        mickey.set({
            x:100+(0|(Math.random()*100)),
            y:100+(0|(Math.random()*100)),
            symbol: String.fromCharCode(10000+ssnInt%60) // dingbats
        });        
    })

    // open #mice, list our object
    app.mice = app.host.get('/Mice#mice', function(){
        app.mice.addObject(mickey);
    });
    // connect to server
    app.host.connect(app.wsServerUri);

    {//show online/offline status //TODO move it to mice-view
        app.host.on('reon', function (spec, val) {
            //console.log('CONNECTED: ', spec.toString(), val);
            document.body.setAttribute('connected', app.host.isUplinked());
        });
        app.host.on('off', function (spec, val) {
            //console.log('DISCONNECTED: ', spec.toString(), val);
            document.body.setAttribute('connected', app.host.isUplinked());
        });
    }

    window.onbeforeunload = function(e) {
        app.mice.removeObject(mickey);
        app.host.close();
    };


})();
