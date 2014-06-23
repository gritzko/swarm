var storage = new Swarm.SharedWebStorage(false);
var hash = window.location.hash || '#0';
var host = Swarm.localhost = new Swarm.Host('me'+hash.replace('#','~'),0,storage);
host.availableUplinks = function () {return [storage]};
// TODO explain no authoritative storage => stalls
if (hash=='#1')
    storage.authoritative = true;
Swarm.localhost = host;
Swarm.debug = true;
var textarea = document.getElementById('text');

var text = new Swarm.Text('/Text#note');


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
