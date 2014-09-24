"use strict";

var FREQ = 30,
    toSend = null,
    timer = null;
var online = document.getElementById('online');

function trackUserMoves (event) {
    if (online && event.clientY>online.offsetTop) { return; }
    if (!window.app.mouse._version) { return; }
    toSend = {
        x: Math.max(0,event.clientX-15),
        y: Math.max(0,event.clientY-15)
    };
    timer = timer || setTimeout(function () {
        var app = window.app;
        app.mouse && app.mouse.set(toSend);
        timer = null;
    }, FREQ);
}

function mickeyGo (event) {
    var app = window.app;
    if (!app.mouse._version) { return; }
    toSend = {
        x: Math.max(0,event.pageX-15),
        y: Math.max(0,event.pageY-15)
    };
    app.mouse && app.mouse.set(toSend);
}

document.documentElement.onmousemove = trackUserMoves;
document.documentElement.ontouchstart = mickeyGo;

/*(function handleOnlineToggle() {
    "use strict";

    var chk_online = document.getElementById('chk_online');
    if (!chk_online) return;

    chk_online.onclick = function () {
        if (chk_online.checked) {
            app.host && app.host.connect(app.wsServerUri);
        } else {
            app.host && app.host.disconnect();
        }
    };
}());
*/
