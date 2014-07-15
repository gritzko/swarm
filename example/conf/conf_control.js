var app = app || {};

function onTalkSelected(ev){
    var talkId = ev.currentTarget.getAttribute('id');
    var m = talkId.match(/(\d+:\d+)_(.+)/);
    if (!m) return;
    var slot = m[1], track=m[2];
    var oldVal = app.agenda.agenda[slot];
    var toAttend = oldVal===track ? '' : track;
    app.agenda.attend({
        slot: m[1],
        track: toAttend
    });
}

$("body").on("click touchstart","td.talk",onTalkSelected);

(function handleOnlineToggle() {
    "use strict";

    var chk_online = document.getElementById('chk_online');
    if (!chk_online) return;

    chk_online.onclick = function () {
        if (chk_online.checked) {
            app.host && app.host.connect(app.uplink_uri);
        } else {
            app.host && app.host.disconnect();
        }
    };
}());
