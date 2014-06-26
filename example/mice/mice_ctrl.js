var app = app || {};

(function handleMouseMove() {
    "use strict";

    var FREQ = 30,
        toSend = null,
        timer = null;
    var online = document.getElementById('online');

    function trackUserMoves (event) {
        if (online && event.clientY>online.offsetTop) return;
        if (!app.mouse._version) return;
        toSend = {
            x: Math.max(0,event.clientX-15),
            y: Math.max(0,event.clientY-15)
        };
        timer = timer || setTimeout(function () {
            app.mouse && app.mouse.set(toSend);
            console.log(toSend);
            timer = null;
        }, FREQ);
    }
    document.documentElement.onmousemove = trackUserMoves;
}());

(function handleOnlineToggle() {
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
