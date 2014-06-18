var app = app || {};

(function datalink() {
    app.id = 'p'+((Math.random()*100)|0);  // FIXME
    var wsServerUri = 'ws://localhost:8000'; // FIXME
    app.host = Swarm.localhost = new Swarm.Host (app.id, 0, new DummyStorage(false));
    
    app.agendaSpec = '/Agenda#test';
    app.agenda = new Agenda(app.agendaSpec);

    app.uplink_uri = 'iframe:parent';
    app.host.connect(app.uplink_uri);

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
