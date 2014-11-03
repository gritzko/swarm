"use strict";

var env = require('./env');
var Spec = require('./Spec');

/**
 * A "pipe" is a channel to a remote Swarm Host. Pipe's interface
 * mocks a Host except all calls are serialized and sent to the
 * *stream*; any arriving data is parsed and delivered to the
 * local host. The *stream* must support an interface of write(),
 * end() and on('open'|'data'|'close'|'error',fn).  Instead of a
 * *stream*, the caller may supply an *uri*, so the Pipe will
 * create a stream and connect/reconnect as necessary.
 */

function Pipe(host, stream, opts) {
    var self = this;
    self.opts = opts || {};
    if (!stream || !host) {
        throw new Error('new Pipe(host,stream[,opts])');
    }
    self._id = null;
    self._host = host;
    // uplink/downlink state flag;
    //  true: this side initiated handshake >.on <.reon
    //  false: this side received handshake <.on >.reon
    //  undefined: nothing sent/received OR had a .reoff
    this.isOnSent = undefined;
    this.reconnectDelay = self.opts.reconnectDelay || 1000;
    self.serializer = self.opts.serializer || JSON;
    self.katimer = null;
    self.send_timer = null;
    self.lastSendTS = self.lastRecvTS = self.time();
    self.bundle = {};
    // don't send immediately, delay to bundle more messages
    self.delay = self.opts.delay || -1;
    //self.reconnectDelay = self.opts.reconnectDelay || 1000;
    if (typeof(stream.write) !== 'function') { // TODO nicer
        var url = stream.toString();
        var m = url.match(/(\w+):.*/);
        if (!m) {
            throw new Error('invalid url ' + url);
        }
        var proto = m[1].toLowerCase();
        var fn = env.streams[proto];
        if (!fn) {
            throw new Error('protocol not supported: ' + proto);
        }
        self.url = url;
        stream = new fn(url);
    }
    self.connect(stream);
}

module.exports = Pipe;
//env.streams = {};
Pipe.TIMEOUT = 60000; //ms

Pipe.prototype.connect = function pc(stream) {
    var self = this;
    self.stream = stream;

    self.stream.on('data', function onMsg(data) {
        data = data.toString();
        env.trace && env.log(self, '.in', data);
        if (!self._host) {
            env.log(self, '.error', 'Pipe closed');
            return;
        }
        self.lastRecvTS = self.time();
        var json = self.serializer.parse(data);
        try {
            self._id ? self.parseBundle(json) : self.parseHandshake(json);
        } catch (ex) {
            console.error('error processing message', ex, ex.stack);
            //this.deliver(this._host.newEventSpec('error'), ex.message);
            this.close();
        }
        self.reconnectDelay = self.opts.reconnectDelay || 1000;
    });

    self.stream.on('close', function onConnectionClosed(reason) {
        self.stream = null; // needs no further attention
        self.close("stream closed");
    });

    self.stream.on('error', function (err) {
        self.close('stream error event: ' + err);
    });

    self.katimer = setInterval(self.keepAliveFn.bind(self), (Pipe.TIMEOUT / 4 + Math.random() * 100) | 0);

    // NOPE client only finally, initiate handshake
    // self._host.connect(self);

};

Pipe.prototype.keepAliveFn = function () {
    var now = this.time(),
        sinceRecv = now - this.lastRecvTS,
        sinceSend = now - this.lastSendTS;
    if (this._id && sinceSend > Pipe.TIMEOUT / 2) {
        this.sendBundle();
    }
    if (sinceRecv > Pipe.TIMEOUT) {
        this.close("stream timeout");
    }
};

Pipe.prototype.parseHandshake = function ph(handshake) {
    var spec, value, key;
    for (key in handshake) {
        spec = new Spec(key);
        value = handshake[key];
        break; // 8)-
    }
    if (!spec) {
        throw new Error('handshake has no spec');
    }
    if (spec.type() !== 'Host') {
        env.log(this, spec, "WARNING! non-Host handshake");
    }
    if (spec.id() === this._host._id) {
        throw new Error('self hs');
    }
    this._id = spec.id();
    var op = spec.op();
    var evspec = spec.set(this._host._id, '#');

    if (op in {on: 1, reon: 1, off: 1, reoff: 1}) {// access denied TODO
        this._host.deliver(evspec, value, this);
    } else {
        throw new Error('invalid handshake');
    }
};

/**
 * Close the underlying stream.
 * Schedule new Pipe creation (when error passed).
 * note: may be invoked multiple times
 * @param {Error|string} error
 */
Pipe.prototype.close = function pc(error) {
    env.log(this, '.close', error ? 'error: ' + error : 'correct');
    if (error && this._host && this.url) {
        var uplink_uri = this.url,
            host = this._host,
            pipe_opts = this.opts;
        //reconnect delay for next disconnection
        pipe_opts.reconnectDelay = Math.min(30000, this.reconnectDelay << 1);
        // schedule a retry
        setTimeout(function () {
            host.connect(uplink_uri, pipe_opts);
        }, this.reconnectDelay);

        this.url = null; //to prevent second reconnection timer
    }
    if (this._host) {
        if (this.isOnSent !== undefined && this._id) {
            // emulate normal off
            var offspec = this._host.newEventSpec(this.isOnSent ? 'reoff' : 'off');
            this._host.deliver(offspec, '', this);
        }
        this._host = null; // can't pass any more messages
    }
    if (this.katimer) {
        clearInterval(this.katimer);
        this.katimer = null;
    }
    if (this.stream) {
        try {
            this.stream.close();
        } catch (ex) {}
        this.stream = null;
    }
    this._id = null;
};

/**
 * Sends operation to remote
 */
Pipe.prototype.deliver = function pd(spec, val, src) {
    var self = this;
    val && val.constructor === Spec && (val = val.toString());
    if (spec.type() === 'Host') {
        switch (spec.op()) {
        case 'reoff':
            setTimeout(function itsOverReally() {
                self.isOnSent = undefined;
                self.close();
            }, 1);
            break;
        case 'off':
            setTimeout(function tickingBomb() {
                self.close();
            }, 5000);
            break;
        case 'on':
            this.isOnSent = true;
            break;
        case 'reon':
            this.isOnSent = false;
        }
    }
    this.bundle[spec] = val === undefined ? null : val; // TODO aggregation
    if (this.delay === -1) {
        this.sendBundle();
    } else if (!this.send_timer) {
        var now = this.time(),
            gap = now - this.lastSendTS,
            timeout = gap > this.delay ? this.delay : this.delay - gap;
        this.send_timer = setTimeout(this.sendBundle.bind(this), timeout); // hmmm...
    } // else {} // just wait
};

/** @returns {number} milliseconds as an int */
Pipe.prototype.time = function () { return new Date().getTime(); };

/**
 * @returns {Spec|string} remote host spec "/Host#peer_id" or empty string (when not handshaken yet)
 */
Pipe.prototype.spec = function () {
    return this._id ? new Spec('/Host#' + this._id) : '';
};
/**
 * @param {*} bundle is a bunch of operations in a form {operation_spec: operation_params_object}
 * @private
 */
Pipe.prototype.parseBundle = function pb(bundle) {
    var spec_list = [], spec, self = this;
    //parse specifiers
    for (spec in bundle) { spec && spec_list.push(new Spec(spec)); }
    spec_list.sort().reverse();
    while (spec = spec_list.pop()) {
        spec = Spec.as(spec);
        this._host.deliver(spec, bundle[spec], this);
        if (spec.type() === 'Host' && spec.op() === 'reoff') { //TODO check #id
            setTimeout(function () {
                self.isOnSent = undefined;
                self.close();
            }, 1);
        }
    }
};

/**
 * Sends operations buffered in this.bundle as a bundle {operation_spec: operation_params_object}
 * @private
 */
Pipe.prototype.sendBundle = function pS() {
    var payload = this.serializer.stringify(this.bundle);
    this.bundle = {};
    if (!this.stream) {
        this.send_timer = null;
        return; // too late
    }

    try {
        env.trace && env.log(this, '.out', payload);
        this.stream.write(payload);
        this.lastSendTS = this.time();
    } catch (ex) {
        env.error('stream error on write: ' + ex, ex.stack);
        if (this._id) {
            this.close('stream error', ex);
        }
    } finally {
        this.send_timer = null;
    }
};

Pipe.prototype.toString = function () {
    return '/Pipe#' + (this._id || 'new_or_closed');
};
