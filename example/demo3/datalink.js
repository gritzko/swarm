var app = app || {};

( function datalink() {
    app.id = 'p'+((Math.random()*100)|0);  // FIXME
    var wsServerUri = 'ws://localhost:8000'; // FIXME

    Swarm.localhost = new Swarm.Host ('swarm~local', 0, new DummyStorage(false));

    new Swarm.PostMessageServer();
    
    app.agendaSpec = '/Agenda#'+app.id;
    //app.agenda = new Agenda(app.agendaSpec);
} )();
