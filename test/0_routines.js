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


function AsyncLoopbackConnection (pair) {
    this.pair = pair || new AsyncLoopbackConnection(this);
    this.ln = null;
    this.cl = null;
    this.queue = [];
    if (!pair) { //emit open
        var self = this;
        setTimeout(function () {
            self.op && self.op();
        })
    }
};

AsyncLoopbackConnection.prototype.on = function (event,ln) {
    if (event==='data')
        this.ln = ln;
    else if (event==='open')
        this.op = ln;
    else if (event==='close')
        this.cl = ln;
};

AsyncLoopbackConnection.prototype.receive = function (string) {
    this.ln && this.ln(string);
};

AsyncLoopbackConnection.prototype.send = function (obj) {
    var self = this;
    self.queue.push(obj.toString());
    setTimeout(function () {
        if (self.pair)
            while (self.queue.length)
                self.pair.receive(self.queue.shift());
    }, 1);
};

AsyncLoopbackConnection.prototype.close = function () {
    var other = this.pair;
    this.pair = null;
    this.op = null;
    this.ln = null;
    if (other) {
        other.close();
        this.cl && this.cl();
    }
};
