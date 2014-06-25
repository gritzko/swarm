var app = app || {};

(function datalink() {
    app.id = window.localStorage.getItem('.localuser') || 
        'anon'+Spec.int2base((Math.random()*10000)|0);
    window.localStorage.setItem('.localuser',app.id);
    Swarm.debug = true;
    
    var hash = window.location.hash || '#0';
    // create Host
    app.host = Swarm.localhost = new Swarm.Host 
        (app.id+hash.replace('#','~')+'agnd', 0, new DummyStorage(false));

    app.uplink_uri = 'iframe:parent';
    var pipe = app.host.connect(app.uplink_uri);
    // never fails/reconnects :)
    app.host.getSources = function () {return [pipe]};
    
    app.agendaSpec = '/Agenda#'+app.id;
    app.agenda = new Agenda(app.agendaSpec);

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
}());
