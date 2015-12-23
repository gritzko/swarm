'use strict';
var Swarm = require('../'); //('swarm-browser');

var app = window.app = {};

app.db = Swarm.DB('test')
app.db.open(function(){
    console.log('open', arguments);
    start_client();
});

function start_client () {
    app.client = new Swarm.Client({
        db_id:  'test',
        ssn_id: 'test',
        connect: 'ws://localhost:10000',
//        empty_db: true,
        db:     app.db,
        callback: start_mvc
    });
    console.log(app.client);
}


var model;


function start_mvc () {
    model = new Swarm.Model({
        voice:   2,
        comment: "microphone check"
    });
    render();
    model.on('change', render);
    var voice_el = window.document.getElementById('voice');
    var comment_el = window.document.getElementById('comment');
    voice_el.onchange = read_in;
    comment_el.onchange = read_in;
}


function render () {
    var voice_el = window.document.getElementById('voice');
    var comment_el = window.document.getElementById('comment');
    if (comment_el.value!==model.comment) {
        comment_el.value = model.comment;
    }
    var options = voice_el.children;
    var voice_val = '' + model.voice;
    for (var i = 0; i < options.length; i++) {
        var option_el = options[i];
        var index = option_el.getAttribute('value');
        if (index===voice_val) {
            option_el.selected = 'on';
        } else {
            option_el.selected = null;
        }
    }
}


function read_in () {
    var voice_el = window.document.getElementById('voice');
    var comment_el = window.document.getElementById('comment');
    var el_value = comment_el.value;
    if (el_value!==model.comment) {
        model.set({comment: el_value});
    }
    var options = voice_el.children;
    var voice_val = '';
    for (var i = 0; i < options.length; i++) {
        var option_el = options[i];
        var index = option_el.getAttribute('value');
        if (option_el.selected) {
            voice_val = parseInt(index);
        }
    }
    if (voice_val!==model.voice) {
        model.set({voice: voice_val});
    }
}
