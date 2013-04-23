svdebug = function(){}

var userSymbols = '\u2665\u2666\u2663\u2660';
var userColors = ['#a55','#5a5','#55a'];

var hash = window.location.hash.toString();
var m = hash.match(/src=(\d+)/);
var SRC = (m&&parseInt(m[1])) || 3;
var m = hash.match(/ssn=(\d+)/);
var SSN = (m&&parseInt(m[1])) || 0;
var PORT = SSN+8000;

var myid = new ID('#',SRC,SSN), myidstr=myid.toString();
var myMouseId = '#maus'+myidstr.substr(4,2);
var peer = new Peer(myid);

var wsServerUri = 'ws://'+(window.location.hostname||'localhost')+':'+PORT+'/client';

var plumber = new Plumber(peer,wsServerUri);

peer._on('/=Peer=',function(spec,val){
    window.document.body.setAttribute('connected',plumber.host.getPeerCount()>0?true:false);
    console.log('repeer',spec,val);
});

var rtt, sample, uriSpan;
var RTT, rttto;

function trackMouse (id) {
    var elem = document.createElement('span');
    elem.setAttribute('class','mouse');
    elem.setAttribute('id',id);
    var src = ID.as(id).src;
    elem.style.color = userColors[src%userColors.length];
    elem.innerHTML = userSymbols.charAt(src%userSymbols.length);
    document.body.appendChild(elem);
    if (id==myMouseId)
        elem.style.fontSize = '50pt';

    var maus = peer.on(Mouse._type+id,function(spec,val){
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
                    rtt.innerHTML = RTT;
                },100);
        }
    });
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
    var mice = peer.on(Mice._type+'#=mice=',function(spec,val){
        console.log('Mice:\t'+spec,val);
        for(var key in val) {
            var keysp = Spec.as(key);
            trackMouse(keysp.field.toString().replace('.','#')); // TODO ugly
        }
    });
    mice.set(myMouseId.replace('#','.'),true); // FIXME ugly

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


};
