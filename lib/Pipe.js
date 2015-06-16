var env = require('./env');
var Spec = require('./Spec');
var Op = require('./Op');

/** accept/respond to the given stream
  * uplinks properly  after a handshake
  *  */
function Pipe (host, stream, options) {
    this.options = options || {};
    this.pending_s = [];
    this.id = null;
    this.pipe_id = null;
    this.peer_pipe_id = null;
    this.closed = false;
    this.uri = options.uri;
    this.host = host;
    this.stream = stream;
    this.bound_flush = this.flush.bind(this);
    this.lastSendTime = 0;
    //this.serializer = options.serializer || LineBasedSerializer;
    if (options.keepAlive) {
        this.timer = setInterval(this.onTimer.bind(this), 1000);
    }
    this.stream.on('data', this.onStreamDataReceived.bind(this));
    this.stream.on('close', this.onStreamClosed.bind(this));
    this.stream.on('error', this.onStreamError.bind(this));
    options.maxSendFreq;
    options.burstWaitTime;
    env.logs.net && console.log(this.uri,'~',this.host.id, "pipe open");
}
module.exports = Pipe;

Pipe.prototype.deliver = function (op) {
    this.pending_s.push(op);
    if (this.asyncFlush) {
        if (!this.flush_timeout) {
            var delay;
            this.flush_timeout = setTimeout(this.bound_flush, delay);
        }
    } else {
        this.flush();
    }
};

Pipe.prototype.flush = function () {
    if (this.closed) {return;}
    var parcel = this.pending_s.join('');
    this.pending_s = [];
    try {
        env.logs.net && console.log(this.id||'unknown','<',this.host.id, parcel);
        this.stream.write(parcel);
        this.lastSendTime = new Date().getTime();
    } catch(ioex) {
        console.error(ioex.message, ioex.stack);
        this.close();
    }
};

Pipe.prototype.onStreamDataReceived = function (data) {
    var self=this;
    if (this.closed) { throw new Error('the pipe is closed'); }
    data = data.toString();
    env.logs.net && console.log
        (this.id||'unknown','>',this.host.id, data);
    if (!data) {return;} // keep-alive
    var lines = data.match(Op.op_re);
    if (!lines) {
        this.deliver(new Op('/Host#'+this.host.id+'.error', 'bad msg format'));
        return;
    }
    var messages = lines.map(function(line){
        return Op.parse(line, self.id);
    });
    var author = this.options.restrictAuthor || undefined;
    for(var i=0; i<messages.length; i++) {
        var msg = messages[i];
        var spec = msg.spec;
        try {
            if (spec.isEmpty()) {
                throw new Error('malformed spec: '+snippet(lines[i]));
            }
            if (!/\/?#!*\./.test(spec.pattern())) {
                throw new Error('invalid spec pattern: '+msg.spec);
            }
            if (author!==undefined && spec.author()!==author) {
                throw new Error('access violation: '+msg.spec);
            }
            this.host.deliver(msg, this);
        } catch (ex) {
            var err_spec = spec.set('.error');
            //this.deliver(new Op(err_spec, ex.message.replace(/\n/g,'')));
            console.error('error processing '+spec, ex.message, ex.stack);
            this.close();
            break;
        }
    }
};

Pipe.prototype.onStreamClosed = function () {
    if (!this.closed) {
        this.close();
    }
};

Pipe.prototype.onStreamError = function (err) {
    console.error('stream error', this.id, err);
};

Pipe.prototype.onTimer = function () {
    if (!this.id && !this.closed) {
        this.close();
    }    // health check
    // keepalive prevents the conn from being killed by overly smart middleboxes
    // and helps the server to keep track of who's really online
    if (this.options.keepAlive) {
        var time = new Date().getTime();
        var silentTime = time - this.lastSendTime;
        if (silentTime > (this.options.keepAliveInterval||50000)) {
            this.flush();
        }
    }
    if (ok) {
        this.options._delay = undefined;
    }
};

Pipe.prototype.close = function () {
    if (this.closed) {return;}
    this.closed = true;
    this.host.onPipeClosed(this);
    this.flush();
    env.logs.net && console.log(this.uri,'~',this.host.id, "pipe closed");
    clearInterval(this.timer);
    try{
        this.stream.close();
    } catch (ex) {
        console.warn('it does not want to close', ex);
    }
    var host = this.host;
    var opts = this.options;
    if (opts.reconnect) {
        opts._delay = opts._delay || opts.reconnectDelay || 500;
        opts._delay <<= (opts.reconnectBackoff||2);
        console.log('reconnect planned');
        setTimeout(function (){
            console.log('reconnect');
            host.connect(opts.uri, opts);
        }, opts._delay);
    }
};


function snippet (o) {
    return (o||'<empty>').toString().replace(/\n/g,'\\n').substr(0,50);
}
