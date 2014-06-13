var app = app || {};

( function datalink() {
    app.id = 'p'+((Math.random()*100)|0);  // FIXME
    var wsServerUri = 'ws://localhost:8000'; // FIXME
    app.host = Swarm.localhost = new Swarm.Host (app.id, 0, new DummyStorage(false));
    
    app.agendaSpec = '/Agenda#test';
    app.agenda = new Agenda(app.agendaSpec);

    app.host.connect('iframe:parent');
} )();
