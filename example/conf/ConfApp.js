var env = require('../../lib/env');
var Spec = require('../../lib/Spec');
var Host = require('../../lib/Host');
var Storage = require('../../lib/Storage');
require('../../lib/Html5Client');
var Agenda = require('./model/Agenda');
var AgendaView = require('./view/AgendaView');
var PostMessageStream = require('../../lib/PostMessageStream');

var app = window.app = {};

app.id = window.localStorage.getItem('.localuser') ||
    'anon'+Spec.int2base((Math.random()*10000)|0);
window.localStorage.setItem('.localuser',app.id);
env.debug = true;

var hash = window.location.hash || '#0';
// create Host
app.host = env.localhost = new Host(
        app.id + hash.replace('#','~') + 'agnd',
        0,
        new Storage(false)
);
app.host.getSources = function () {
    var self = this;
    return Object.keys(this.sources).map(function (key) { return self.sources[key]; });
};
app.uplink_uri = 'iframe:parent';
app.host.connect(app.uplink_uri);

app.agendaSpec = '/Agenda#'+app.id;
app.agenda = new Agenda(app.agendaSpec);

app.host.on('reon', function (spec, val) {
    document.body.setAttribute('connected', app.host.isUplinked());
});
app.host.on('off', function (spec, val) {
    document.body.setAttribute('connected', app.host.isUplinked());
});

// insert <script> before </body> !
React.renderComponent(
        AgendaView({spec:app.agendaSpec}),
        document.getElementById('agenda')
        );
