var app = app || {};

(function () {
    var FREQ = 30;
    var toSend = null;
    var timer = null;
    function trackUserMoves (event) {
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
})();
