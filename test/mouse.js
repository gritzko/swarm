svdebug = function(){}

var userSymbols = '\u2665\u2666\u2663\u2660';
var userColors = []; //['#a55','#5a5','#55a','#758','#785','#857','#875','#578','#587'];

for(var r=40; r<=200; r+=40)
    for(var g=40; g<=200; g+=40)
        for(var b=40; b<=200; b+=40)
            userColors.push('rgb('+r+','+g+','+b+')');

var hash = window.location.hash.toString();
var m = hash.match(/src=(\d+)/);
var SRC = (m&&parseInt(m[1])) || 3;
var m = hash.match(/ssn=(\d+)/);
var SSN = (m&&parseInt(m[1])) || 0;
var PORT = SSN+8000;

var myid = new ID('#',SRC,SSN), myidstr=myid.toString();
var myMouseId = '#maus'+myidstr.substr(4,2);
var myMouseElem, myMouse;
var peer = new Peer(myid);

var wsServerUri = 'ws://'+(window.location.hostname||'localhost')+':'+PORT+'/client';

var plumber = new Plumber(peer,wsServerUri);

peer._on('/=Peer=',function(spec,val){
    window.document.body.setAttribute('connected',plumber.host.getPeerCount()>0?true:false);
    console.log('repeer',spec,val);
});

var rtt, sample, uriSpan;
var RTT, rttto, noTrack=false;

function moveMouse (spec,val){
    var maus = peer.findObject(spec.id);
    var elem = document.getElementById(spec.id);
    elem.style.left = maus.x-elem.clientWidth/2;
    elem.style.top = maus.y-elem.clientHeight/2;
    spec.parse('!');
    if (spec.version.src==SRC) {
        if (spec.version.ssn!=SSN) {
            var ms = new Date().getTime() - maus.ms;
            RTT = 'rtt '+(ms>1000?Math.floor(ms/1000)+'ms':(ms+'ms'));
        } else
            RTT = 'rtt: n/a';
        if (!rttto)
            rttto = setTimeout(function(){
                rttto = null;
                rtt.innerHTML = RTT + (noTrack ? ' (automated)' : '');
            },100);
    }
};

function trackMouse (id) {
    var elem = document.getElementById(id);
    if (elem) return;
    elem = document.createElement('span');
    elem.setAttribute('class','mouse');
    elem.setAttribute('id',id);
    var src = ID.as(id).src;
    elem.style.color = userColors[src%userColors.length];
    elem.innerHTML = userSymbols.charAt(src%userSymbols.length);
    document.body.appendChild(elem);
    if (id==myMouseId) {
        elem.style.fontSize = '30pt';
        myMouseElem = elem;
    }

    var maus = peer.on(Mouse._type+id,moveMouse);
}

function untrackMouse (id) {
    peer.off(id,moveMouse);
    var elem = document.getElementById(id);
    elem && elem.parentNode.removeChild(elem);
}

window.onload = function () {

    rtt = document.getElementById('rtt');
    sample = document.getElementById('sample');
    uriSpan = document.getElementById('uri');

    uriSpan.innerHTML = wsServerUri;
    //sample.style.color = userColors[SRC%userColors.length];
    //sample.innerHTML = userSymbols.charAt(SRC%userSymbols.length);

    var id = Mouse.prototype._type + myMouseId;
    var mouse = peer.on(id);
    mouse.set ({
            ms: new Date().getTime(),
            x: (Math.random()*100)|0,
            y: (Math.random()*100)|0
    });
    var mice = peer.on('/=Mice=#=mice=',function(spec,val){
        console.log('Mice:\t'+spec,val);
        for(var key in val) {
            var keysp = Spec.as(key);
            var mid = keysp.field.toString().replace('.','#'); // TODO ugly
            if (val[key])
                trackMouse(mid);
            else
                untrackMouse(mid);
        }
    });
    mice.set(myMouseId.replace('#','.'),true); // FIXME ugly

    document.body.onmousemove = function (event) {
        if (noTrack) return;
        mouse.set({
            x: event.clientX,
            y: event.clientY,
            ms: new Date().getTime()
        });
    };

    var autoMoveInterval;

    function autoMove () {
        var width = document.body.clientWidth;
        var height = document.body.clientHeight;
        var midx = width>>1, midy = height>>1;
        var cos = mouse.x-midx, sin = mouse.y-midy;
        var r = Math.sqrt(cos*cos+sin*sin);
        cos /= r; sin /= r;
        var a = Math.acos(cos);
        if (sin<0)
            a+=(Math.PI-a)*2;
        var newa = a+0.1;
        if (newa>Math.PI*2)
            newa -= Math.PI*2;
        var newx = midx + r * Math.cos(newa);
        var newy = midy + r * Math.sin(newa);
        mouse.set({
            x: newx,
            y: newy,
            ms: new Date().getTime()
        });
    }

    setInterval(function keepalive(){
        mouse.setMs(new Date().getTime());
    },1000*10);

    document.body.onclick = function (ev) {
        if (ev.altKey) {
            if (autoMoveInterval) {
                clearInterval(autoMoveInterval);
                autoMoveInterval = null;
                noTrack = false;
            } else {
                autoMoveInterval = setInterval(autoMove,200);
                noTrack = true;
            }
        }
    };


};

