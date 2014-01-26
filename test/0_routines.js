function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
};
DummyStorage.prototype.deliver = function (spec,value,src) {
    var ti = spec.filter('/#');
    //var obj = this.states[ti] || (this.states[ti]={_oplog:{},_logtail:{}});
    var tail = this.tails[ti];
    if (!tail)
        this.tails[ti] = tail = {};
    var vm = spec.filter('!.');
    if (vm in tail)
        console.error('op replay @storage');
    tail[vm] = value;
};
DummyStorage.prototype.on = function () {
    var spec, replica;
    if (arguments.length===2) {
        spec = new Spec(arguments[0]);
        replica = arguments[1];
    } else
        throw 'xxx';
    var ti = spec.filter('/#'), self=this;
    function reply () {
        var state = self.states[ti];
        // FIXME mimic diff; init has id, tail has it as well
        if (state) {
            var response = {};
            response['!'+state._version+'.init'] = state;
            var tail = self.tails[ti];
            if (tail)
                for(var s in tail)
                    response[s] = tail[s];
            var clone = JSON.parse(JSON.stringify(response));
            replica.deliver(ti,clone,self);
        }
        replica.reon(ti,'!'+(state?state._version:'0'),self);
    }
    this.async ? setTimeout(reply,1) : reply();
};

DummyStorage.prototype.off = function (spec,value,src) {
};
DummyStorage.prototype.normalizeSignature = Syncable.prototype.normalizeSignature;

Swarm.debug = true;


function AsyncLoopbackConnection (pair) {
    this.pair = pair || new AsyncLoopbackConnection(this);
    this.ln = null;
    this.queue = [];
};
AsyncLoopbackConnection.prototype.on = function (event,ln) {
    if (event==='data')
        this.ln = ln;
};
AsyncLoopbackConnection.prototype.receive = function (string) {
    this.ln(string);
};
AsyncLoopbackConnection.prototype.send = function (obj) {
    var self = this;
    /*if (this.queue)
        this.queue.push(obj.toString());
    else*/
    setTimeout(function(){
        self.pair.receive(obj.toString());
    },1);
};
/*AsyncLoopbackConnection.prototype.release = function () {
    while (this.queue.length)
        this.pair.receive(this.queue.shift());
    this.queue = null;
}*/
AsyncLoopbackConnection.prototype.close = function () {
    var other = this.pair;
    this.pair = null;
    other&&other.close();
};