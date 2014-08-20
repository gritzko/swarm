require('../../lib/Html5Client.js');
var env = require('../../lib/env');
var Host = require('../../lib/Host');
var Text = require('../../lib/Text');
var SharedWebStorage = require('../../lib/SharedWebStorage');

env.debug = true;

var storage = new SharedWebStorage(false);
var hash = window.location.hash || '#0';
var host = env.localhost = new Host('me'+hash.replace('#','~'),0,storage);
host.availableUplinks = function () {return [storage]};

// TODO explain no authoritative storage => stalls
if (hash=='#1')
    storage.authoritative = true;
env.debug = true;
var textarea = document.getElementById('text');

var text = new Text('/Text#note');


if (!text.text && host._id==='me~1') {
    text.set("Hello world!");
}

function M2V () {
    textarea.value = text.text;
}

text.on('.init',M2V); // FIXME on('')
text.on(M2V);

textarea.onkeyup = function textChange(ev) {
    var el = ev.target;
    var value = el.value;
    if (value!=text.text)
        text.set(value);
}
