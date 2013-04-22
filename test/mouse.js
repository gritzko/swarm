function Mouse() {
    this.x = 0;
    this.y = 0;
}

Peer.extend(Mouse,'/=Mouse');

svdebug = function(){}
var port = parseInt(window.location.hash||'8000');

var peer = new Peer(new ID('#',3,port-8000));

var id = Mouse.prototype._type + '#mickey';

var mouse = peer.on(id);

var plumber = new Plumber(peer,'ws://localhost:8000/client');

peer._on('/=Peer=',function(spec,val){
    window.document.body.setAttribute('connected',plumber.host.getPeerCount()>0?true:false);
    console.log('repeer',spec,val);
});

/*var ws = new WebSocket('ws://localhost:8000/client');

ws.on = ws.addEventListener;
ws.onopen = function() {
    var pipe = new Pipe(ws,peer);
    //peer.addPeer(pipe);
    console.log('connected');
};*/

window.onload = function () {

    document.body.innerHTML = '<span id="x" style="position:absolute; width:10px; height:10px; background: red;"></span>';
    var x = document.getElementById('x');

    document.body.onmousemove = function (event) {
        mouse.setX(event.clientX);
        mouse.setY(event.clientY);
    };

    mouse.on('',function(spec,val){
        x.style.left = mouse.x-10;
        x.style.top = mouse.y-10;
    });

};
