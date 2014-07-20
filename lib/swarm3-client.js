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
    this.url = url;
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
    if (this.buf)
        this.buf.push(data);
    else
        this.ws.send(data);
};

Swarm.streams.ws = Swarm.streams.wss = WSStream;

// This stream implementation uses postMessage to synchronize to
// another IFRAME (use URIs like iframe:parent or iframe:elementId)
function PostMessageStream(frameUri, origin, secret) {
    this.origin = origin;
    this.lstn = {};
    if (frameUri.constructor === String) {
        var m = frameUri.match(/^iframe:(\w+)/i);
        if (!m) throw new Error('invalid URL');
        var frameId = m[1];
        if (!frameId || frameId === 'parent') {
            this.targetWindow = window.parent;
        } else {
            var i = document.getElementById(frameId);
            if (!i) throw new Error('element unknown: '+frameId);
            if (!i.contentWindow) throw new Error('not an IFRAME');
            this.targetWindow = i.contentWindow;
        }
    } else {
        if (!frameUri.location) throw new Error('1st param: target frame');
        this.targetWindow = frameUri;
    }
    var rnd = (Math.random()*100000000)|0, time = new Date().getTime();
    this.secret = secret ||
        ( Swarm.Spec.int2base(time) + '~' + Swarm.Spec.int2base(rnd) ) ;
    PostMessageStream.streams[this.secret] = this;
    this.pending = null;
    this.retries = 0;
    this.retryInt = null;
    if (!secret) { // make sure somebody listens on the other end
        this.pending = '';
        var self = this;
        this.retryInt = setInterval(function(){
            self.retryHandshake();
        },100); // keep pinging the other frame for 1 second
    }
    this.write(''); // handshake
}
Swarm.PostMessageStream = PostMessageStream;
PostMessageStream.streams = {};
PostMessageStream.re64 = /^([0-9A-Za-z_~]+)>/;

PostMessageStream.prototype.retryHandshake = function () {
    if (this.pending===null) { // it's OK
        clearInterval(this.retryInt);
        return;
    } 
    if (this.retries++>10) {
        clearInterval(this.retryInt);
        this.lstn.error && this.lstn.error('no response from the frame');
        this.close();
    } else {
        this.write('');
        console.warn('retrying postMessage handshake');
    }
};

PostMessageStream.prototype.onMessage = function (msg,origin) {
    if (this.origin && origin!==this.origin) {
        console.warn('mismatched origin: ',origin,this.origin)
        return;
    }
    if (this.pending!==null) {
        var p = this.pending;
        this.pending = null;
        p && this.write(p);
    }
    msg && this.lstn.data && this.lstn.data(msg);
}

// FIXME: explicitly invoke (security - entry point)
window.addEventListener('message', function onPostMessage (ev) {
    var msg = ev.data.toString();
    var m = msg.match(PostMessageStream.re64);
    if (!m) return;
    var secret = m[1], json = msg.substr(secret.length+1);
    var stream = PostMessageStream.streams[secret];
    if (!stream) {
        if (!PostMessageStream.host) throw new Error('unknown stream: '+secret);
        stream = new PostMessageStream(ev.source,PostMessageStream.origin,secret);
        stream.on('close', function cleanup() {
            delete PostMessageStream.streams[secret];
        });
        PostMessageStream.host.accept(stream);
    }
    stream.onMessage(json,ev.origin);
});

PostMessageStream.listen = function (host,origin) {
    PostMessageStream.host = host;
    PostMessageStream.origin = origin;
};


PostMessageStream.prototype._on = WSStream.prototype.on;

PostMessageStream.prototype.on = function (evname,fn) {
    this._on(evname,fn);
};

PostMessageStream.prototype.write = function (data) {
    if (this.pending!==null) {
        this.pending += data || '';
        data = '';
    }
    var str = this.secret + '>' + data;
    this.targetWindow.postMessage(str, this.origin || '*');
};

PostMessageStream.prototype.close = function () {
    var ln = this.lstn || {};
    ln.close && ln.close();
    delete PostMessageStream.streams[this.secret];
};

PostMessageStream.prototype.log = function (event, message) {
    console.log('pm:' + this.frameId, event, message);
};

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
