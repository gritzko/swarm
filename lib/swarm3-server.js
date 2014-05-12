//var ws = require('ws');
var swarm = require('./swarm3.js');
swarm.debug = true;

function FileStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
}
exports.FileStorage = FileStorage;

FileStorage.prototype.version = swarm.Host.prototype.version;

FileStorage.prototype.deliver = function (spec,value,src) {
    if (spec.method()==='on')
        return this.on(spec,value,src);
    // stash the op
    var ti = spec.filter('/#');
    var tail = this.tails[ti];
    if (!tail)
        this.tails[ti] = tail = {};
    var vm = spec.filter('!.');
    if (vm in tail)
        console.error('op replay @storage');
    tail[vm] = value;
};

FileStorage.prototype.on = function (spec,base,replica) {
    spec = new swarm.Spec(spec);
    var ti = spec.filter('/#'), self=this;
    function reply () {
        // authoritative storage: no thing => return empty
        var state = self.states[ti];
        if (!state && base==='!0' && !spec.token('#').ext) {
            // the storage is authoritative for the object => may
            // create it
            state={ _version: self.version() };
        }
        if (!state) {
            state={ _version: '0' }; // I officially know nothing
        }
        // FIXME mimic diff; init has id, tail has it as well
        var response = {};
        if (state)
            response['!'+state._version+'.init'] = state;
        var tail = self.tails[ti];
        if (tail)
            for(var s in tail)
                response[s] = tail[s];
        var clone = JSON.parse(JSON.stringify(response));
        replica.deliver(spec.set('.bundle'),clone,self);
        replica.__reon( ti.add(spec.version(),'!').add('.reon'),
                        '!'+(state?state._version:'0'), self );
    }
    this.async ? setTimeout(reply,1) : reply();
};

FileStorage.prototype.off = function (spec,value,src) {
};
FileStorage.prototype.normalizeSignature = swarm.Syncable.prototype.normalizeSignature;


function EinarosWSStream (ws) {
    var ln = this.lstn = {};
    this.ws = ws;
    ws.onopen = function () { ln.open && ln.open() };
    ws.onclose = function () { ln.close && ln.close() };
    ws.onmessage = function (msg) {
        if (msg.type!=='Text')
            throw new Error('unexpected msg type',msg.type);
        try{
            console.log(msg.data);
            ln.data && ln.data(msg.data)
        }catch(ex){
            console.error('message processing fails',ex);
            ln.error && ln.error(ex.message)
        }
    };
    ws.onerror = function (msg) { ln.error && ln.error(msg) };
}
exports.EinarosWSStream = EinarosWSStream;

EinarosWSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

EinarosWSStream.prototype.write = function (data) {
    this.ws.send(data.toString());
};

swarm.Pipe.streams.ws = swarm.Pipe.streams.wss = EinarosWSStream;

