var app = app || {};

$("body").on("click","td.talk",function onTalkSelected(ev){
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
});
