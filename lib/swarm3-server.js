//var ws = require('ws');
Swarm = require('./swarm3.js');
Swarm.debug = true;

function FileStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
}
exports.FileStorage = FileStorage;

FileStorage.prototype.version = Swarm.Host.prototype.version;

FileStorage.prototype.deliver = function (spec,value,src) {
    if (spec.op()==='on') return this.on(spec,value,src);
    if (spec.op()==='off') return; // this imlpementation doesn't push changes
    if (spec.op()==='bundle')
        console.error('?');
    // A storage is always an "uplink" so it never receives reon, reoff.
    var ti = spec.filter('/#'),
        tail = this.tails[ti] || (this.tails[ti] = {}),
        count = 0;
    for(var s in tail) count++;
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    if (count < 3 || src._id !== spec.id()) {
        var vm = spec.filter('!.');
        if (vm in tail) console.error('op replay @storage');
        tail[vm] = value;
    } else { // ...otherwise it saves the state, zeroes the tail.
        var state = src.diff();
        this.states[ti] = state;
        this.tails[ti] = {};
    }
};

FileStorage.prototype.on = function (spec,base,replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#'), self=this;

    function reply () {
        var state = self.states[ti];
        var tail = self.tails[ti];
        var idtok = spec.token('#');
        var vertok = spec.token('!');
        if (state || tail) { // if we have something return it
            state = state || {};
            tail = tail || {};
            // don't pass by reference
            state = JSON.parse(JSON.stringify(state));
            state._tail = JSON.parse(JSON.stringify(tail));
            /*} else if (spec.id()===spec.version()) { // new object created
             if (base && typeof(base)==='object') { // TODO impl this @Syncable
             // TODO add sanity checks
             state = JSON.parse(JSON.stringify(base));
             state._version = '!'+spec.version();
             self.states[ti] = state;
             } may be a bad idea (offline creation) */
        } else {
            state = self.states[ti] = {_version:'!0'}; // no operations => !0
        }
        replica.deliver(spec.set('.patch'),state,self);
        var ihave = new Swarm.Spec.Map(state._version);
        for(var v in tail)
            ihave.add(v);
        replica.deliver( ti.add(spec.version(),'!').add('.reon'),
                ihave.toString(), self );
    }
    this.async ? setTimeout(reply,1) : reply();
};

FileStorage.prototype.off = function (spec,value,src) {
};
FileStorage.prototype.normalizeSignature = Swarm.Syncable.prototype.normalizeSignature;


function EinarosWSStream(ws) {
    var self = this;
    var ln = this.lstn = {};
    this.ws = ws;
    var buf = [];
    if (ws.readyState !== 1/*WebSocket.OPEN*/) this.buf = buf; //will wait for "open"
    ws.on('open', function () {
        buf.reverse();
        self.buf = null;
        while (buf.length) self.write(buf.pop());
    });
    ws.on('close', function () { ln.close && ln.close() });
    ws.on('message', function (msg) {
        try {
            console.log(msg);
            ln.data && ln.data(msg)
        } catch(ex) {
            console.error('message processing fails',ex);
            ln.error && ln.error(ex.message)
        }
    });
    ws.on('error', function (msg) { ln.error && ln.error(msg) });
}
exports.EinarosWSStream = EinarosWSStream;

EinarosWSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

EinarosWSStream.prototype.write = function (data) {
    if (this.buf)
        this.buf.push(data.toString());
    else
        this.ws.send(data.toString());
};

Swarm.Pipe.streams.ws = Swarm.Pipe.streams.wss = EinarosWSStream;

