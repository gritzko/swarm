var app = app || {};

( function datalink() {
    // don't need OAuth for a demo, gen fake user account
    app.id = window.localStorage.getItem('.localuser') || 
        'anon'+Spec.int2base((Math.random()*10000)|0);
    window.localStorage.setItem('.localuser',app.id);
    app.wsServerUri = window.location.origin.replace(/^http/,'ws');
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
