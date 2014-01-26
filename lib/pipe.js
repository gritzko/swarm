/** Mocks a Host except all calls are serialized and sent
  * to the sink; any arriving data is parsed and delivered
  * to the local host. */
function Pipe (host,sink,opts) {
    var self = this;
    self.opts = opts||{};
    self._id = null;
    self.sink = sink;
    self.host = self._host = host;
    self.katimer = null;
    self.lastSendTS = self.lastRecvTS = this.time();
    self.bundle = {};
    self.timeout = self.opts.timeout || -1;
    self.serialize = self.opts.serialize || JSON.stringify;
    self.deserialize = self.opts.deserialize || JSON.parse;
    self.reconnectDelay = 1000;
    self.katimer = setInterval(function(){
        self.keepalive();
    }, Pipe.KEEPALIVE_PERIOD_HALF+(10*Math.random())|0); // desynchronize
    self.connect();
}
Pipe.KEEPALIVE_PERIOD = 8000; //ms
Pipe.UNHERD = 20; // 20ms, thundering herd avoidance

Pipe.prototype.connect = function pc () {
    var self = this;
    var evName = self.opts.messageEvent || 'data';
    var evField = self.opts.messageField || null; //'data'
    if (!this.sink)
        this.sink = this.opts.sink(); // factory
    self.sink.on(evName, function onmsg(msg) {
        self.lastRecvTS = self.time();
        self.reconnectDelay = 1000;
        self.parseBundle(evField?msg[evField]:msg.toString());
    });
    self.sink.on('close',function(reason){
        if (!self.sink) return;
        self.sink = null;
        if (self.opts.sink) {
            self.reconnectDelay = Math.min(30000,self.reconnectDelay<<1);
            setTimeout(function(){
                self.connect();
            }, self.reconnectDelay);
        } else
            self.close();
    });
};

Pipe.prototype.deliver = function pd (spec,val,src) {
    var self = this;
    self.bundle[spec] = val; // TODO aggregation
    if (self.timeout===-1)
        return self.sendBundle();
    var now = this.time(), gap = now-self.lastSendTS;
    self.timer = self.timer || setTimeout(function(){
        self.sendBundle();
        self.timer = null;
    }, gap>self.timeout ? PIPE.UNHERD*Math.random() : self.timeout-gap );
};

// milliseconds as an int
Pipe.prototype.time = function () { new Date().getTime() };
Pipe.prototype.spec = function () { return new Spec('/Host#'+this._id); };

Pipe.prototype.keepalive = function () {
    var now = this.time();
    if (now-this.lastSendTS>Pipe.KEEPALIVE_PERIOD_HALF)
        this.sendBundle(); // empty "{}" message
    if (now-this.lastRecvTS>Pipe.KEEPALIVE_PERIOD*1.5) 
        this.stuck = true;
    if (now-this.lastRecvTS>Pipe.KEEPALIVE_PERIOD*4)
        this.close();
};

Pipe.prototype.parseHandshake = function ph (spec,value) {
    var spec = new Spec(spec);
    this._id = spec.id();
    if (spec.method()!=='on' && spec.method()!=='reon')
        throw new Error('invalid method');
    this.host[spec.method()](spec,value,this);
    //(spec.method()=='on') &&
    //    this.reon(this.host.spec()+'!'+this.host.version(), value);
};

Pipe.prototype.parseBundle = function pb (msg) {
    var obj = this.deserialize(msg.toString()), keys = [], spec;
    for(var key in obj)
        key && keys.push(new Spec(key));
    keys.sort().reverse();
    if (!this._id) {// TODO fetch on()
        var spec=keys.shift();
        return this.parseHandshake(spec,obj[spec]);
    }
    while (spec = keys.pop())
        this.host.deliver(new Spec(spec), obj[spec], this);
};

Pipe.prototype.sendBundle = function pS () {
    var self = this;
    if (!self.sink) {}
    var sendStr = self.serialize(self.bundle);
    self.bundle = {};
    try {
        console.log('goes to',this._id,sendStr);
        self.sink.send(sendStr);
        self.lastSendTS = this.time();
    } catch (ex) {
        console.error('send error'+ex); // ^ 'close' event assumed 
        //self.close();
	}
};

Pipe.prototype.close = function pc () {
    clearInterval(this.katimer);
    if (this.sink) try {
        this.sink.close();
        this.sink = null;
    } catch(ex){}
    if (this._id) {
        this.host.removePeer(this);
        this._id = null;
    }
    if (this.timer)
        clearTimeout(this.timer);
};


var syncMethods = ['on','off','reon','reoff'];

Swarm.genericize = function genericize (fn) {
    fn.prototype.normalizeSignature = Swarm.Syncable.prototype.normalizeSignature;
    function addMethod (method) {
        fn.prototype[method] = function () { 
            this.normalizeSignature(arguments,method);
            var spec=new Spec(arguments[0]), value=arguments[1], replica=arguments[2];
            !spec.has('.') && (spec=spec.add(method,'.'));
            this.deliver(spec,value,replica);
        };
    }
    for(var i=0; i<syncMethods.length; i++) 
        addMethod(syncMethods[i]);
};

Swarm.genericize(Pipe);