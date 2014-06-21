var storage = new Swarm.SharedWebStorage(false);
var hash = window.location.hash || '#0';
var host = Swarm.localhost = new Swarm.Host('me'+hash.replace('#','~'),0,storage);
host.availableUplinks = function () {return [storage]};
if (hash=='#1')
    storage.authoritative = true;
Swarm.localhost = host;
Swarm.debug = true;
var textarea = document.getElementById('text');

var text = new Swarm.Text('/Text#note');

text.on(function(){
    textarea.value = text.text;
    console.log('textarea refresh',text.text);
});

if ('$pending_dl$' in text._lstn[2])   // TODO explain no authoritative storage => stalls
    console.error('should not happen');

if (!text.text && host._id==='me~1') {
    text.set("Hello world!");   
}


textarea.onkeyup = function textChange(ev) {
    var el = ev.target;
    var value = el.value;
    if (value!=text.text)
        text.set(value);
}
