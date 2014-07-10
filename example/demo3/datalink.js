var app = app || {};

// Antics
// * two tabs: mice goes offline
// * agenda doesn't sync to tabs
// * text does not sync to tabs, is not saved

( function datalink() {
    // don't need OAuth for a demo, gen fake user account
    app.id = window.localStorage.getItem('.localuser') || 
        'anon'+Spec.int2base((Math.random()*10000)|0);
    window.localStorage.setItem('.localuser',app.id);
    app.wsServerUri = 'ws://'+window.location.host;
    Swarm.debug = true;

    app.host = Swarm.localhost = new Swarm.Host (app.id+'~local', 0, new DummyStorage(false));

    new Swarm.PostMessageServer();
    
    app.agendaSpec = '/Agenda#'+app.id;
    //app.agenda = new Agenda(app.agendaSpec);
    
    app.host.connect(app.wsServerUri);
    
    if (window.location.hostname==='localhost') {
        document.body.setAttribute('local','1');
    }
    
} )();
