Swarm.Syncable.prototype.log = function (spec, value, replica) {
    var myspec = this.spec().toString(); //:(
    console.log(
            "%c@%s  %c%s%c%s  %c%O  %c%s@%c%s",
            "color: #888",
                this._host._id,
            "color: #246",
                this.spec().toString(),
            "color: #024; font-style: italic",
                (myspec==spec.filter('/#')?
                    spec.filter('!.').toString() :
                    ' <> '+spec.toString()),  // FIXME ONLY MY SPEC
            "font-style: normal; color: #042",
                (value&&value.constructor===Swarm.Spec?value.toString():value),
            "color: #88a",
                (replica&&((replica.spec&&replica.spec().toString())||replica._id)) ||
                (replica?'no id':'undef'),
            "color: #ccd",
                replica&&replica._host&&replica._host._id
            //replica&&replica.spec&&(replica.spec()+
            //    (this._host===replica._host?'':' @'+replica._host._id)
    );
};

function WSStream (url) {
    var self = this;
    var ln = this.lstn = {};
    var ws = this.ws = new WebSocket(url);
    var buf = this.buf = [];
    ws.onopen = function () {
        buf.reverse();
        self.buf = null;
        while (buf.length)
            self.write(buf.pop());
            
    };
    ws.onclose = function () { ln.close && ln.close() };
    ws.onmessage = function (msg) { ln.data && ln.data(msg.data) };
    ws.onerror = function (err) { ln.error && ln.error(err) };
}

WSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

WSStream.prototype.write = function (data) {
    console.log('writing',data);
    if (this.buf)
        this.buf.push(data);
    else
        this.ws.send(data);
};

Swarm.Pipe.streams.ws = Swarm.Pipe.streams.wss = WSStream;

Swarm.WebStorage = function SwarmWebStorage(usePersistentStorage) {
    this.ls = usePersistentStorage || false;
    this.tails = {};
    this.listeners = {};
    this._id = 'webstorage';
    this.authoritative = true;
    var store = this.store = usePersistentStorage ? localStorage : sessionStorage;
    // scan/sort specs for existing records
    for(var i=0; i<store.length; i++) {
        var key = store.key(i);
        var value = store.getItem(key);
        var spec = new Spec(key);
        if (spec.pattern()!=='/#!.') continue; // ops only
        var ti = spec.filter('/#');
        var tail = this.tails[ti];
        if (!tail) tail = this.tails[ti] = [];
        tail.push(spec.filter('!.'));
    }
    for(var ti in this.tails)
        this.tails[ti].sort();
    
    var self = this;
    // FIXME compat FF, IE
    function onStorageChange (ev) {
        console.warn('storage event');
        var spec = new Spec(ev.key);
        var value = JSON.parse(ev.newValue);
        if (value===undefined) return;
        if (spec.pattern()!=='/#!.') return; // TODO states
        var ti = spec.filter('/#'), vm=spec.filter('!.');    
        var tail = self.tails[ti];
        if (tail && tail.indexOf(vm)!==-1) return; // I know
        var ln = self.listeners[ti];
        if (ln) for(var i=0; i<ln.length; i++)
            ln[i].deliver(spec,value,self);
    }
    window.addEventListener('storage', onStorageChange, false);
    
};

Swarm.WebStorage.prototype.time = Swarm.Host.prototype.time;

Swarm.WebStorage.prototype.deliver = function (spec,value,src) {
    console.log('@STORE',spec,value);
    if (spec.method()==='on')
        return this.on(spec,value,src);
    else if (spec.method()==='off')
        return this.off(spec,value,src);
    // A storage is always an "uplink" so it never receives reon, reoff.
        
    var ti = spec.filter('/#'), vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = []);
    
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    if (tail.length<10 || src._id!==spec.id()) {
        tail.push(vm);
        this.store.setItem(spec,JSON.stringify(value));
    } else { // ...otherwise it saves the state, zeroes the tail.
        var state = src.diff(), k;
        this.store.setItem(ti,JSON.stringify(state));
        while (k=tail.pop())
            this.store.removeItem(ti+k);
    }
};

Swarm.WebStorage.prototype.on = function (spec,base,replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#'), self=this;

    var state = this.store.getItem(ti);
    if (state) state = JSON.parse(state);
    var tailKeys = this.tails[ti], tail = undefined;
    if (tailKeys) {
        tail = {};
        for(var i=0; i<tailKeys.length; i++) {
            var vm = tailKeys[i];
            tail[vm] = JSON.parse(this.store.getItem(ti+vm));
        }
    }
    // if an authoritative uplink then may send !0 responses
    if (!state && !tail && this.authoritative) {
        state = {_version:'!0'};
        this.store.setItem(ti,JSON.stringify(state));
    }
    if (!state && tail) state = {};
    if (tail) state._tail = tail;
    
    if (state) replica.deliver(spec.set('.patch'),state,this);
    
    var ihave = new Swarm.Spec.Map(state._version);
    if (tail) for(var v in tail) ihave.add(v);
    replica.__reon( ti.add(spec.version(),'!').add('.reon'),  // FIXME deliver()
                    ihave.toString(), self );
    
    var ln = this.listeners[ti];
    if (!ln) ln = this.listeners[ti] = [];
    ln.push(replica);
    
};

Swarm.WebStorage.prototype.off = function (spec,value,src) {
    // FIXME
};


