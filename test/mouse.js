function Mouse() {
    this.x = 0;
    this.y = 0;
}

Peer.extend(Mouse);

//svdebug = function(){}

var peer = new Peer(new ID('*',3,17));

var id = Mouse.prototype._tid + '#000000';

var mouse = peer.on(id);

var ws = new WebSocket('ws://localhost:8000/client?src=3&ssn=17');
ws.on = ws.addEventListener;
ws.onopen = function() {
    var pipe = new Pipe(new ID('*',0,0),ws,peer);
    peer.addPeer(pipe);
    console.log('connected');
};

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
