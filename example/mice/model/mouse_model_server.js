if (typeof exports === 'object') {
    Swarm = require('../../../lib/swarm3.js');
}

var moribund = {};

function miceClean () {
    var time = new Date().getTime();
    var host = Swarm.localhost;
    var online = {};
    for (var src in host.sources) {
        var m = src.match(/([A-Za-z0-9_\~]+)(\~[A-Za-z0-9_\~]+)/);
        if (!m) { console.error('alien',src); continue; }
        online[m[1]] = true;
        console.error(m[1],'online');
    }
    var mice = host.get('/Mice#mice');
    if (!mice._version) return;
    var objects = mice.objects;
    for(var s in objects) {
        var spec = new Swarm.Spec(s);
        if (spec.type()!=='Mouse') continue;
        var id = spec.id();
        if (id in online) {
            delete moribund[id];
            continue;
        } else {
            console.error(id,'not in sources');
        }
        if (id in moribund) continue;
        moribund[id] = time;
    }
    var ancient = time - 10*1000;
    for(var id in moribund) {
        var ts = moribund[id];
        if (ts<ancient) mice.removeObject('/Mouse#'+id);
        delete moribund[id];
    }
}

setInterval(miceClean,1000);
