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

WSStream.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        var self = this,
            prev_fn = this.lstn[evname];
        this.lstn[evname] = function () {
            prev_fn.apply(self, arguments);
            fn.apply(self, arguments);
        }
    } else {
        this.lstn[evname] = fn;
    }
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
function PostMessageStream(url, initial_event_data) {
    var self = this;
    var ln = this.lstn = {};
    var m = url.match(/^iframe:(\w+)/i);
    if (!m) throw new Error('invalid URL');
    this.frameId = m[1];
    if (!this.frameId || this.frameId === 'parent') {
        self.frame = window.parent;
    } else {
        var i = document.getElementById(this.frameId);
        if (!i) throw new Error('element unknown');
        if (!i.contentWindow) throw new Error('not an IFRAME');
        self.frame = i.contentWindow;
    }
    this.postMessageListener = function (ev) {
        if (!ev.source) console.error('no source, IE?');
        var frame = ev.source.frameElement;
        if (frame !== self.frame.frameElement) return;
        var ev_data = ev.data;
        if (ev_data === PostMessageStream.PEER_CLOSED_MESSAGE) {
            self.log('peer closed');
            self.close();
            return;
        }
        self.log('reading', ev_data);
        ln.data && ln.data(ev_data);
    };
    window.addEventListener('message', this.postMessageListener);

    // reinsert the initial message
    if (initial_event_data) {
        setTimeout( function () { ln.data && ln.data(initial_event_data); }, 0 );
    }
}
PostMessageStream.PEER_CLOSED_MESSAGE = 'peer_closed';

PostMessageStream.prototype.on = WSStream.prototype.on;

PostMessageStream.prototype.write = function (data) {
    this.log('writing', data);
    this.frame.postMessage(data, window.location.origin);
};

PostMessageStream.prototype.close = function () {
    this.write(PostMessageStream.PEER_CLOSED_MESSAGE);
    var ln = this.lstn || {};
    ln.close && ln.close();
    window.removeEventListener('message', this.postMessageListener);
};

PostMessageStream.prototype.log = function (event, message) {
    console.log('pm:' + this.frameId, event, message);
};

Swarm.PostMessageServer = function PostMessageServer(host) {
    var known = {};
    host = host || Swarm.localhost;
    window.addEventListener('message', function (ev){
        var elem = ev.source.frameElement;
        var id = elem.getAttribute('id');
        if (id && (id in known)) return;

        if (!id) {
            id = 'if' + Swarm.PostMessageServer.count++;
            elem.setAttribute('id', id);
        }
        known[id] = true;

        var stream = new PostMessageStream('iframe:' + id, ev.data);
        stream.on('close', function exclude_from_known() {
            delete known[id];
        });

        host.accept(stream);
    });
};
Swarm.PostMessageServer.count = 1;

Swarm.streams.iframe = PostMessageStream;


// There are two ways to use WebStorage. One is shared storage, where
// all tabs/frames have access to the data. Another is to relay events
// using the HTML5 'storage' event. The latter one should be implemented
// as a Stream not Storage as it needs all the handshakes and stuff.
Swarm.SharedWebStorage = function SwarmWebStorage(usePersistentStorage) {
    this.ls = usePersistentStorage || false;
    this.listeners = {};
    this._id = 'webstorage';
    this.authoritative = false;
    this.tails = {};
    var store = this.store = usePersistentStorage ? localStorage : sessionStorage;
    
    this.loadTails();
    
    var self = this;
    // FIXME compat FF, IE
    function onStorageChange (ev) {
        console.warn('@',self._host._id,'storage event',ev.key);
        if (!Spec.is(ev.key) || !ev.newValue) return;
        //if (self.store.getItem(ev.key)!==ev.newValue) return; // FIXME some hint (conflicts with tail cleanup)
        var spec = new Spec(ev.key);
        // states and tails are written as /Type#id.state/tail
        // while ops have full /#!. specifiers.
        if (spec.pattern()!=='/#!.') {
            if (spec.pattern()==='/#') delete self.tails[spec];
            return; // FIXME no-tails, upstream patch => need to actully apply that state
        }
        var ti = spec.filter('/#'), vo=spec.filter('!.');    
        if (self.tails[ti] && (vo in self.tails[ti])) return;
        var value = JSON.parse(ev.newValue);
        // send the op back to our listeners
        var ln = self.listeners[ti];
        if (ln) for(var i=0; i<ln.length; i++)
            ln[i].deliver(spec,value,self);
        // FIXME .patch may need special handling
    }
    window.addEventListener('storage', onStorageChange, false);
    
};

Swarm.SharedWebStorage.prototype.loadTails = function () {
    // scan/sort specs for existing records
    var store = this.store,
        ti;
    for(var i=0; i<store.length; i++) {
        var key = store.key(i),
            spec = new Spec(key),
            value = store.getItem(key);
        if (spec.pattern() !== '/#!.') continue; // ops only

        ti = spec.filter('/#');
        var tail = this.tails[ti];
        if (!tail) tail = this.tails[ti] = [];
        tail.push(spec.filter('!.'));
    }
    for(ti in this.tails) this.tails[ti].sort();
};

Swarm.SharedWebStorage.prototype.time = Swarm.Host.prototype.time;

Swarm.SharedWebStorage.prototype.deliver = function (spec,value,src) {
    switch (spec.op()) {
    // A storage is always an "uplink" so it never receives reon, reoff.
    case 'on':    return this.on(spec, value, src);
    case 'off':   return this.off(spec, value, src);
    case 'patch': return this.patch(spec, value, src);
    default:      return this.op(spec, value, src);
    }
};

Swarm.SharedWebStorage.prototype.op = function wsOp (spec, value, src) {
    var ti = spec.filter('/#'),
        vm = spec.filter('!.'),
        tail = this.tails[ti] || (this.tails[ti] = []);
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    tail.push(vm);
    this.store.setItem(spec, JSON.stringify(value));
    if (tail.length > 5) {
        src.deliver(spec.set('.on'), '!0.init', this); // request a patch
    }
};

Swarm.SharedWebStorage.prototype.patch = function wsPatch (spec, state, src) {
    var ti = spec.filter('/#');
    this.store.setItem(ti, JSON.stringify(state));
    var tail = this.tails[ti];
    if (tail) {
        var k;
        while (k = tail.pop()) this.store.removeItem(ti + k);
        delete this.tails[ti];
    }
};

Swarm.SharedWebStorage.prototype.on = function (spec, base, replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#');
    var state = this.store.getItem(ti);
    if (state) {
        state = JSON.parse(state);
    } else {
        // an authoritative uplink then may send !0 responses
        if (this.authoritative) {
            state = {_version: '!0'};
            this.store.setItem(ti, JSON.stringify(state));
        }
    }

    var tailKeys = this.tails[ti];
    if (tailKeys) {
        state = state || {};
        var tail = state._tail || (state._tail = {});
        for(var i = 0; i < tailKeys.length; i++) {
            var vm = tailKeys[i];
            tail[vm] = JSON.parse(this.store.getItem(ti + vm));
        }
    }

    replica.deliver(spec.set('.patch'), state || {}, this);
    
    var vv = state ? Swarm.stateVersionVector(state) : '!0';

    replica.deliver(ti.add(spec.version(), '!').add('.reon'), vv, this);
    
    var ln = this.listeners[ti];
    if (!ln) ln = this.listeners[ti] = [];
    ln.push(replica);
};

Swarm.SharedWebStorage.prototype.off = function (spec,value,src) {
    // FIXME
};


