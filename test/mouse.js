svdebug = function(){}
var port = parseInt(window.location.hash.replace(/[^\d]/g,'')||'8000');

var userSymbols = '\u2665\u2666\u2663\u2660';
var userColors = ['#a55','#5a5','#55a'];

var SRC = 3; //(Math.random()*(1<<30))|1;
var SSN = port-8000;

var peer = new Peer(new ID('#',SRC,SSN));

var id = Mouse.prototype._type + '#mickey';

var mouse = peer.on(id);

var wsServerUri = 'ws://localhost:8000/client';

var plumber = new Plumber(peer,wsServerUri);

peer._on('/=Peer=',function(spec,val){
    window.document.body.setAttribute('connected',plumber.host.getPeerCount()>0?true:false);
    console.log('repeer',spec,val);
});

/*var ws = new WebSocket('ws://localhost:8000/client');

ws.on = ws.addEventListener;
ws.onopen = function() {
    var pipe = new Pipe(ws,peer);
    //peer.addPeer(pipe);
    console.log('connected');
};*/

window.onload = function () {

    var x = document.getElementById('x');
    var rtt = document.getElementById('rtt');
    var sample = document.getElementById('sample');
    var uriSpan = document.getElementById('uri');

    x.style.color = userColors[SRC%userColors.length];
    x.innerHTML = userSymbols.charAt(SRC%userSymbols.length);
    uriSpan.innerHTML = wsServerUri;
    //sample.style.color = userColors[SRC%userColors.length];
    //sample.innerHTML = userSymbols.charAt(SRC%userSymbols.length);

    document.body.onmousemove = function (event) {
        /*mouse.setX(event.clientX);
        mouse.setY(event.clientY);
        mouse.setMs(new Date().getTime()); // TODO bundle*/
        mouse.set({
            x: event.clientX,
            y: event.clientY,
            ms: new Date().getTime()
        });
    };

    mouse.on('',function(spec,val){
        x.style.left = mouse.x-x.clientWidth/2;
        x.style.top = mouse.y-x.clientHeight/2;
        spec.parse('!');
        if (spec.version.src==SRC && spec.version.ssn==SSN) {
            var ms = new Date().getTime() - mouse.ms;
            rtt.innerHTML = 'rtt '+ms+'ms';
        } else
            rtt.innerHTML = 'rtt: n/a';
    });

};
