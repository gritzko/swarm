// CSS-enabled console (Chrome, FF, Safari)
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
    ws.onmessage = function (msg) {
        console.log('wss received', msg.data);
        ln.data && ln.data(msg.data)
    };
    ws.onerror = function (err) { ln.error && ln.error(err) };
}

WSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'multiple listeners are not supported';
    this.lstn[evname] = fn;
};

WSStream.prototype.write = function (data) {
    console.log('wss writing',data);
    if (this.buf)
        this.buf.push(data);
    else
        this.ws.send(data);
};

Swarm.streams.ws = Swarm.streams.wss = WSStream;


// This stream implementation uses postMessage to synchronize to
// another IFRAME (use URLs like iframe:parent or iframe:elementId)
function PostMessageStream (url, initial_event_data) {
    var self = this;
    var ln = this.lstn = {};
    var m = url.match(/^iframe:(\w+)/i);
    if (!m) throw new Error('invalid URL');
    var frameId = m[1];
    if (!frameId || frameId==='parent') {
        self.frame = window.parent;
    } else {
        var i = document.getElementById(frameId);
        if (!i) throw new Error('element unknown');
        if (!i.contentWindow) throw new Error('not an IFRAME');
        self.frame = i.contentWindow;
    }
    window.addEventListener('message',function (ev){
        if (!ev.source) console.error('no source, IE?');
        var frame = ev.source.frameElement;
        if (frame!==self.frame.frameElement) return;
        console.log('pm reading',ev.data);
        ln.data && ln.data(ev.data);
    });

    // reinsert the initial message
    if (initial_event_data) {
        setTimeout( function () { ln.data && ln.data(initial_event_data); }, 0 );
    }
}

PostMessageStream.prototype.on = WSStream.prototype.on;

PostMessageStream.prototype.write = function (data) {
    console.log('pm writing',data);
    this.frame.postMessage(data,window.location.origin);
};

Swarm.PostMessageServer = function PostMessageServer (host) {
    var known = {};
    host = host || Swarm.localhost;
    window.addEventListener('message',function (ev){
        var elem = ev.source.frameElement;
        var id = elem.getAttribute('id');
        if (id && (id in known)) return;

        if (!id) {
            id = 'if'+Swarm.PostMessageServer.count++;
            elem.setAttribute('id',id);
        }
        known[id] = true;

        host.accept(new PostMessageStream('iframe:'+id, ev.data));
    });
};
Swarm.PostMessageServer.count = 1;

Swarm.streams.iframe = PostMessageStream;


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
    if (spec.op() === 'on')
        return this.on(spec,value,src);

    if (spec.op() === 'off')
        return this.off(spec,value,src);

    // A storage is always an "uplink" so it never receives reon, reoff.
    var ti = spec.filter('/#'),
        vm = spec.filter('!.'),
        tail = this.tails[ti] || (this.tails[ti] = []);
    
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    if (tail.length < 10 || src._id !== spec.id()) {
        tail.push(vm);
        this.store.setItem(spec, JSON.stringify(value));
    } else { // ...otherwise it saves the state, zeroes the tail.
        var state = src.diff(), k;
        this.store.setItem(ti,JSON.stringify(state));
        while (k=tail.pop()) {
            this.store.removeItem(ti + k);
        }
    }
};

Swarm.WebStorage.prototype.on = function (spec,base,replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#'),
        state = this.store.getItem(ti),
        tailKeys = this.tails[ti],
        tail = undefined;

    if (state) state = JSON.parse(state);

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
    replica._neutral.reon.call(replica, ti.add(spec.version(),'!').add('.reon'),  // FIXME deliver()
                    ihave.toString(), this);
    
    var ln = this.listeners[ti];
    if (!ln) ln = this.listeners[ti] = [];
    ln.push(replica);
};

Swarm.WebStorage.prototype.off = function (spec,value,src) {
    // FIXME
};


