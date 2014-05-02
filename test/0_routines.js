function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
};

DummyStorage.prototype.version = Swarm.Host.prototype.version;

DummyStorage.prototype.deliver = function (spec,value,src) {
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

DummyStorage.prototype.on = function (spec,base,replica) {
    spec = new Swarm.Spec(spec);
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

DummyStorage.prototype.off = function (spec,value,src) {
};
DummyStorage.prototype.normalizeSignature = Swarm.Syncable.prototype.normalizeSignature;

Swarm.debug = true;


function AsyncLoopbackConnection (url) {
    var m = url.match(/loopback:(\w+)/);
    if (!m) throw 'invalid url';
    this.id = m[1];
    this.lstn = {};
    this.queue = [];
    if (this.id in AsyncLoopbackConnection.pipes)
        throw new Error('duplicate');
    AsyncLoopbackConnection.pipes[this.id] = this;
    var pair = this.pair();
    if (pair && pair.queue.length) pair.write();
};
AsyncLoopbackConnection.pipes = {};

Swarm.Pipe.streams.loopback = AsyncLoopbackConnection;

AsyncLoopbackConnection.prototype.pair = function () {
    var pairId = this.id.match(/./g).reverse().join('');
    return AsyncLoopbackConnection.pipes[pairId];
};

AsyncLoopbackConnection.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'multiple listeners not supported';
    this.lstn[evname] = fn;
};

AsyncLoopbackConnection.prototype.receive = function (string) {
    this.lstn.data && this.lstn.data(string);
};

AsyncLoopbackConnection.prototype.write = function (obj) {
    var self = this;
    obj && self.queue.push(obj.toString());
    setTimeout(function () {
        var pair = self.pair();
        if (!pair) return;
        while (self.queue.length)
            pair.receive(self.queue.shift());
    }, 1);
};

AsyncLoopbackConnection.prototype.close = function () {
    delete AsyncLoopbackConnection.pipes[this.id];
    var pair = this.pair();
    pair && pair.close();
    this.lstn.close && this.lstn.close();
};
