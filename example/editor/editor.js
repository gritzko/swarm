var storage = new Swarm.WebStorage(false);
var host = Swarm.localhost = new Swarm.Host('gritzko',0,storage);
host.availableUplinks = function () {return [storage]};
Swarm.localhost = host;
var textarea = document.getElementById('text');

var text = new Swarm.Text('/Text#note');

text.on(function(){
    textarea.value = text.text;    
});

if (!text.text) {
    text.set("Hello world!");    
}


console.log('haha',text.text);

textarea.onkeyup = function textChange(ev) {
    var el = ev.target;
    var value = el.value;
    if (value!=text.text)
        text.set(value);
    console.log(value);
}
