// card suits
var userSymbols = '\u2665\u2666\u2663\u2660';
var userColors = [];

var myClientId,         // id of the client/peer/session
    myClient,           // the client/peer (well, it is connected to the server, but may connect elsewhere)
    wsServerUri,        // WebSocket URI to connect to
    myMouseId,          // id of my object (which is a mouse tracking card suit sign)
    myMouseElem,        // the DOM element for my suit sign (no Views, so we do it all manually)
    myMouseObject,      // my js object (has .x, .y and .ms for timestamps)
    miceList,           // all mice currently alive (on the basis of keepalives)
    plumber,            // WebSocket connection manager
    portStr,
    peerData;

var RTT, rttto, noTrack=false;


function init () {
    // fill in the palette array
    for(var r=40; r<=200; r+=40)
        for(var g=40; g<=200; g+=40)
            for(var b=40; b<=200; b+=40)
                userColors.push('rgb('+r+','+g+','+b+')');
    // parse parameters
    var hash = window.location.hash.toString();
    var m = hash.match(/src=(\d+)/);
    var SRC = (m&&parseInt(m[1])) || 3;
    var m = hash.match(/ssn=(\d+)/);
    var SSN = (m&&parseInt(m[1])) || 0;
    var PORT = SSN+8000;
    portStr = ''+PORT;
    while (portStr.length<6) portStr = '0'+portStr;
    // derive my ids
    myClientId = new ID('#',SRC,SSN);
    var myidstr=myClientId.toString();
    myMouseId = '#mous'+myidstr.substr(4,2);
    // WebSocket URI to connect the peer to
    wsServerUri = 'ws://'+(window.location.hostname||'localhost')+':'+PORT+'/client';
    var uriSpan = document.getElementById('uri');
    uriSpan.innerHTML = wsServerUri;
}

function subscribe () {
    // create the peer object
    myClient = new Peer(myClientId);
    // the plumber manages reconnects
    plumber = new Plumber(myClient,wsServerUri);
    // listen for disconnects/connects; that tells us the online/offline status
    myClient._on('/=Peer=',function(spec,val){
        window.document.body.setAttribute('connected',plumber.host.getPeerCount()>0?true:false);
    });

    // open "my" mouse object
    myMouseObject = myClient.on( Mouse.prototype._type + myMouseId );
    myMouseObject.setMs(new Date().getTime());

    // open the singleton collection listing all mice currently alive
    miceList = myClient.on('/=Mice=#=mice=',function(spec,val){
        //console.log('Mice:\t'+spec,val);
        for(var key in val) {
            var keysp = Spec.as(key);
            var mid = keysp.field.toString().replace('.','#'); // TODO ugly
            if (val[key]) {
                trackMouse(mid);
            } else {
                if (mid!=myMouseId)
                    untrackMouse(mid);
                else
                    miceList.set(key,true); // return of the jedi
            }
        }
    });
    // mention our mouse in the list
    miceList.set(myMouseId.toString().replace('#','.'),true); // FIXME ugly

    peerData = myClient.on('/PeerDt#'+portStr, showCountDown);
}

/** Reflect any changes to a Mouse object: move the card suit symbol on the screen, write RTT */
function moveMouse (spec,val){
    var maus = myClient.findObject(spec.id);
    var elem = document.getElementById(spec.id);
    elem.style.left = maus.x-elem.clientWidth/2;
    elem.style.top = maus.y-elem.clientHeight/2;
    spec.parse('!');  // convert the version from its serialized form to an object
    if (spec.version.src==myClientId.src) 
        showRtt(spec,val);
}

function showRtt (spec,val) {
    var rttSpan = document.getElementById('rtt'), rttText;
    if (!val.ms || !rttSpan) return;
    if (spec.version.ssn!=myClientId.ssn) {
        var ms = new Date().getTime() - val.ms;
        rttText = 'rtt '+(ms>1000?Math.floor(ms/1000)+'ms':(ms+'ms'));
    } else
        rttText = 'rtt: n/a';
    rttSpan.innerHTML = rttText + (noTrack ? ' (automated)' : '');
}

function showCountDown (spec,val) {
    var countSpan = document.getElementById('count');
    if (!countSpan) return;
    countSpan.innerHTML = peerData.timeToRestart ? 
        (0|(peerData.timeToRestart/1000)) + 's till restart' : 'will not restart';
}

/** Debugging: move the mouse in circles */
function autoMove () {
    var width = document.body.clientWidth;
    var height = document.body.clientHeight;
    var midx = width>>1, midy = height>>1;
    var cos = myMouseObject.x-midx, sin = myMouseObject.y-midy;
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
    myMouseObject.set({
        x: newx,
        y: newy,
        ms: new Date().getTime()
    });
}

/** Start listening to a mouse object, draw the suit sign, etc */
function trackMouse (id) {
    var elem = document.getElementById(id);
    if (elem) return;
    // create the onscreen element (suit sign)
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
    // create the actual object, open a subscription
    var maus = myClient.on(Mouse._type+id, moveMouse );  // see moveMouse() above
}

/** Stop tracking somebody's mouse pointer */
function untrackMouse (id) {
    myClient.off(id,moveMouse);
    var elem = document.getElementById(id);
    elem && elem.parentNode.removeChild(elem);
}

function trackUserMoves (event) {
    if (noTrack) return;
    myMouseObject.set({
        x: event.clientX,
        y: event.clientY,
        ms: new Date().getTime()
    });
}

window.onload = function () {

    init();

    subscribe();

    // track the actual mouse pointer, change our object
    document.body.onmousemove = trackUserMoves;

    /** Update the timestamp to avoid being kicked out by the server */
    setInterval(function keepalive(){
        myMouseObject && myMouseObject.setMs(new Date().getTime());
        miceList.set(myMouseId.toString().replace('#','.'),true); // FIXME ugly
    },1000*10);

    var autoMoveInterval;
    /** Start/stop making circles */
    document.body.onclick = function (ev) {
        if (!ev.altKey)  return;
        if (autoMoveInterval) {
            clearInterval(autoMoveInterval);
            autoMoveInterval = null;
            noTrack = false;
        } else {
            autoMoveInterval = setInterval(autoMove,200);
            noTrack = true;
        }
    };


};

