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
    portStr,
    peerData;

var RTT, rttto, noTrack=false;


function init () {
    Swarm.debug = true;
    // fill in the palette array
    for(var r=40; r<=200; r+=40)
        for(var g=40; g<=200; g+=40)
            for(var b=40; b<=200; b+=40)
                userColors.push('rgb('+r+','+g+','+b+')');
    // parse parameters
    var hash = window.location.hash.toString();
    var m = hash.match(/src=(\d+)/);
    var SRC = Swarm.Spec.int2base((m&&parseInt(m[1])) || 3);
    var m = hash.match(/ssn=(\d+)/);
    var SSN = (m&&parseInt(m[1])) || 0;
    var PORT = SSN + 8000;
    portStr = ''+PORT;
    while (portStr.length<6) portStr = '0'+portStr;
    // derive my ids
    myClientId = new Swarm.Spec('#' + SRC + '~' + SSN);
    var myidstr = myClientId.toString();
    myMouseId = 'mouse+'+SRC;
    // WebSocket URI to connect the peer to

    //FOR CLUSTER:
    //wsServerUri = 'ws://'+(window.location.hostname||'localhost')+':'+PORT+'/client';

    //FOR SINGLE SERVER:
    wsServerUri = 'ws://'+(window.location.hostname||'localhost')+':8000/client';

    var uriSpan = document.getElementById('uri');
    uriSpan.innerHTML = wsServerUri;
}

function subscribe () {
    // create the peer object
    myClient = new Swarm.Host(myClientId);
    Swarm.localhost = myClient;
    // the plumber manages reconnects

    var connectionFactory = function () {
        var sink = {
            ws: new WebSocket(wsServerUri),
            on: function(event, cb) {
                switch (event) {
                case 'message':
                    sink.ws.onmessage = cb;
                    break;
                case 'error':
                    sink.ws.onerror = cb;
                    break;
                case 'open':
                    sink.ws.onopen = cb;
                    break;
                case 'close':
                    sink.ws.onclose = cb;
                    break;
                default:
                    console.error('unknown event: ', event);
                }
            },
            send: function (data) {
                sink.ws.send(data);
            }
        };
        return sink;
    };
    var pipe = new Swarm.Pipe(myClient, null, {
        sink: connectionFactory,
        messageEvent: 'message',
        openEvent: 'open',
        messageField: 'data'
    });
    pipe.connect();

    // open "my" mouse object
    myClient.on('/Mouse#' + myMouseId + '.init', function (spec, mouse_pojo, mouse) {
        console.log('Mouse.init:\t', spec, mouse_pojo);

        myMouseObject = mouse;
        myMouseObject.set({'ms': new Date().getTime()});

        /** Update the timestamp to avoid being kicked out by the server */
        setInterval(function keepalive(){
            myMouseObject.set({'ms': new Date().getTime()});
        },1000*10);

        // open the singleton collection listing all mice currently alive
        myClient.on('/Mice#mice.init', function(spec, mice_pojo, mice) {
            console.log('Mice.init:\t', spec, mice_pojo);

            myClient.on('/Mice#mice.set', trackMice);

            function trackMice (spec, val) {
                console.log('trackMice:\t', spec, val);
                for(var key in val) if (val.hasOwnProperty(key)) {
                    if (val[key]) {
                        trackMouse(key);
                    } else {
                        if (key != myMouseId)
                            untrackMouse(key);
                        else
                            mice.set(key, key); // return of the jedi
                    }
                }
            }

            mice.add(myMouseId, myMouseObject.spec().toString());

            trackMice(spec, mice_pojo);

            trackMouse(myMouseId);
        });

    });

    /*
        peerData = myClient.on('/PeerData#'+portStr, showCountDown);
    */
}

/** Reflect any changes to a Mouse object: move the card suit symbol on the screen, write RTT */
function moveMouse (spec,val){
    var maus = myClient.get(spec);
    var spec_id = new Swarm.Spec(spec).id();
    var elem = document.getElementById(spec_id);
    if (!elem) { return; }
    elem.style.left = maus.x-elem.clientWidth/2;
    elem.style.top = maus.y-elem.clientHeight/2;
    if (spec_id == myClientId) {
        showRtt(spec, val);
    }
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
    var ext = Swarm.Spec.base2int(new Swarm.Spec(id, '#').token('#').ext);
    elem.style.color = userColors[ext%userColors.length];
    elem.innerHTML = userSymbols.charAt(ext%userSymbols.length);
    document.body.appendChild(elem);
    if (id==myMouseId) {
        elem.style.fontSize = '30pt';
        myMouseElem = elem;
    }
    // create the actual object, open a subscription
    var maus = myClient.on('/Mouse#'+id, moveMouse );  // see moveMouse() above
}

/** Stop tracking somebody's mouse pointer */
function untrackMouse (id) {
    myClient.off(id,moveMouse);
    var elem = document.getElementById(id);
    elem && elem.parentNode.removeChild(elem);
}

var FREQ = 10;
var toSend = null;
var timer = null;
function trackUserMoves (event) {
    if (noTrack) return;
    toSend = {
        x: event.clientX,
        y: event.clientY,
        ms: new Date().getTime()
    };
    if (!timer) {
        timer = setTimeout(function () {
            myMouseObject.set(toSend);
            timer = null;
        }, FREQ);
    }
}

window.onload = function () {

    init();

    subscribe();

    // track the actual mouse pointer, change our object
    document.body.onmousemove = trackUserMoves;

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

