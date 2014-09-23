"use strict";

var Swarm = require('../../lib/Html5Client'); // bulk require()
var PostMessageStream = require('../../lib/PostMessageStream');
require('../conf/model/Agenda.js');

var app = window.app = {};

// don't need OAuth for a demo, gen fake user account
app.id = window.localStorage.getItem('.localuser') ||
    'anon' + Swarm.Spec.int2base((Math.random()*10000)|0);
window.localStorage.setItem('.localuser',app.id);
app.wsServerUri = 'ws://'+window.location.host;
Swarm.env.debug = true;

app.host = Swarm.env.localhost = new Swarm.Host
    (app.id+'~local', 0, new Swarm.Storage(false));

PostMessageStream.listen(app.host);

app.agendaSpec = '/Agenda#'+app.id;
//app.agenda = new Agenda(app.agendaSpec);

app.host.connect(app.wsServerUri);

if (window.location.hostname==='localhost') {
    document.body.setAttribute('local','1');
}
