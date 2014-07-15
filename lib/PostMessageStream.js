'use strict';

var Spec     = require('./Spec');
var WSStream = require('./WSStream');

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
        ( Spec.int2base(time) + '~' + Spec.int2base(rnd) ) ;
    PostMessageStream.streams[this.secret] = this;
    console.warn('created stream: '+this.secret);
    //this.targetWindow.postMessage(this.secret,this.origin);
}
PostMessageStream.streams = {};
PostMessageStream.re64 = /^([0-9A-Za-z_~]+)>/;

PostMessageStream.prototype.onMessage = function (msg,origin) {
    if (this.origin && origin!==this.origin) {
        console.warn('mismatched origin: ',origin,this.origin)
        return;
    }
    this.lstn.data && this.lstn.data(msg);
}

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
    stream.onMessage(json,ev.origin); //source.location.href);
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
    //var origin = window.location.protocol + '//' + window.location.host;
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

module.exports = PostMessageStream;
