"use strict";

var env = require('./env');
var Spec = require('./Spec');

// This stream implementation uses postMessage to synchronize to
// another IFRAME (use URIs like iframe:parent or iframe:elementId)
function PostMessageStream(frameUri, origin, secret) {
    this.origin = origin;
    this.lstn = {};
    if (frameUri.constructor === String) {
        var m = frameUri.match(/^iframe:(\w+)/i);
        if (!m) {
            throw new Error('invalid URL');
        }
        var frameId = m[1];
        if (!frameId || frameId === 'parent') {
            this.targetWindow = window.parent;
        } else {
            var i = document.getElementById(frameId);
            if (!i) {
                throw new Error('element unknown: ' + frameId);
            }
            if (!i.contentWindow) {
                throw new Error('not an IFRAME');
            }
            this.targetWindow = i.contentWindow;
        }
    } else {
        if (!frameUri.location) {
            throw new Error('1st param: target frame');
        }
        this.targetWindow = frameUri;
    }
    var rnd = (Math.random() * 0xffffff) | 0;
    var time = new Date().getTime() & 0xffffff;
    this.secret = secret ||
    ( Spec.int2base(time) + '~' + Spec.int2base(rnd) );
    PostMessageStream.streams[this.secret] = this;
    this.pending = null;
    this.retries = 0;
    this.retryInt = null;
    if (!secret) { // make sure somebody listens on the other end
        this.pending = '';
        var self = this;
        this.retryInt = setInterval(function () {
            self.retryHandshake();
        }, 100); // keep pinging the other frame for 1 second
    }
    this.write(''); // handshake
}
PostMessageStream.streams = {};
PostMessageStream.re64 = /^([0-9A-Za-z_~]+)>/;

PostMessageStream.prototype.retryHandshake = function () {
    if (this.pending === null) { // it's OK
        clearInterval(this.retryInt);
        return;
    }
    if (this.retries++ > 10) {
        clearInterval(this.retryInt);
        this.lstn.error && this.lstn.error('no response from the frame');
        this.close();
    } else {
        this.write('');
        console.warn('retrying postMessage handshake');
    }
};

PostMessageStream.prototype.onMessage = function (msg, origin) {
    if (this.origin && origin !== this.origin) {
        console.warn('mismatched origin: ', origin, this.origin);
        return;
    }
    if (this.pending !== null) {
        var p = this.pending;
        this.pending = null;
        p && this.write(p);
    }
    msg && this.lstn.data && this.lstn.data(msg);
};

// FIXME: explicitly invoke (security - entry point)
window.addEventListener('message', function onPostMessage(ev) {
    var msg = ev.data.toString();
    var m = msg.match(PostMessageStream.re64);
    if (!m) {
        return;
    }
    var secret = m[1], json = msg.substr(secret.length + 1);
    var stream = PostMessageStream.streams[secret];
    if (!stream) {
        if (!PostMessageStream.host) {
            throw new Error('unknown stream: ' + secret);
        }
        stream = new PostMessageStream(ev.source, PostMessageStream.origin, secret);
        stream.on('close', function cleanup() {
            delete PostMessageStream.streams[secret];
        });
        PostMessageStream.host.accept(stream);
    }
    stream.onMessage(json, ev.origin);
});

PostMessageStream.listen = function (host, origin) {
    PostMessageStream.host = host;
    PostMessageStream.origin = origin;
};


PostMessageStream.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        var self = this,
            prev_fn = this.lstn[evname];
        this.lstn[evname] = function () {
            prev_fn.apply(self, arguments);
            fn.apply(self, arguments);
        };
    } else {
        this.lstn[evname] = fn;
    }
};

PostMessageStream.prototype.write = function (data) {
    if (this.pending !== null) {
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

env.streams.iframe = PostMessageStream;
module.exports = PostMessageStream;
