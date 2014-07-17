var fs = require('fs'),
    path = require('path'),
    Swarm = require('./swarm3.js'),
    ws_lib = require('ws'),
    Spec = Swarm.Spec;

Swarm.debug = true;

/**
 * An improvised filesystem-based storage implementation.
 * Objects are saved into separate files in a hashed directory
 * tree. Ongoing operations are streamed into a log file.
 * One can go surprisingly far with this kind of an approach.
 * https://news.ycombinator.com/item?id=7872239
 *
 * v load:   preload existing log chunks
 *   on:     load state, add tail, send, reon base=????
 *   patch:  state=> save state; log=> append
 *   op:     append
 *   unload: may flush all states
 * v onflush:new flush
 *
 * Difference: with/without direct access to the state.
 * Will not request state from the client side anyway.
 */
function FileStorage(dir) {
    this._host = null; //will be set during Host creation
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    if (!fs.existsSync(dir + '/_log')) fs.mkdirSync(dir + '/_log');
    this._id = 'file'; //path.basename(dir);

    //for time() method
    this.lastTs = '';
    this.tsSeq = 0;

    this.dir = dir;
    this.tails = {};
    this.dirtyQueue = [];
    this.logCount = 0;
    this.loadTails();
    this.logFile = undefined;
    this.rotateLog();
}
Swarm.FileStorage = FileStorage;

FileStorage.prototype.time = Swarm.Host._pt.time;

FileStorage.prototype.version = Swarm.Host._pt.version;

FileStorage.prototype.deliver = function (spec, value, src) {
    switch (spec.op()) {
    case 'on':    return this.on(spec, value, src);
    case 'off':   return this.off(spec, value, src);
    case 'patch': return this.patch(spec, value, src);
    default:      return this.op(spec, value, src);
    }
};

FileStorage.prototype.appendToLog = function appendToLog(ti, verop2val) {

    var tail = this.tails[ti];
    if (!tail) this.tails[ti] = tail = {};
    // stash ops in RAM (can't seek in the log file so need that)
    for (var verop in verop2val) tail[verop] = verop2val[verop];
    // queue the object for state flush
    this.dirtyQueue.push(ti.toString());
    // serialize the op as JSON
    var o = {},
        self = this;
    o[ti] = verop2val;  // TODO annoying
    var buf = JSON.stringify(o) + ',\n';
    // append JSON to the log file
    this.logFile.write( buf, function onFail(err){
        if (err) {
            console.error('log append fail; terminating', err);
            self.logFile.end(function () {
                process.exit(120);
            });
        }
    });
    this.logSize += buf.length;
    if (this.logSize > this.MAX_LOG_SIZE) this.rotateLog();
    // We flush objects to files one at a time to keep HDD seek rates
    // at reasonable levels; if something fails we don't get stuck for
    // more than 1 second.
    if (this.pulling === 0 || this.pulling < new Date().getTime() - 1000) {
        this.pullState(ti);
    }
};

FileStorage.prototype.pullState = function pullState(ti) {
    var spec;
    while (spec = this.dirtyQueue.shift()) {
        if (typeof(spec) === 'number') {
            var cleared = this.logFileName(spec);
            // FIXME we should not delete the file before the state
            // will be flushed to the disk
            fs.unlink(cleared, function (err) {
                if (err) {
                    console.log('fs.unlink failed: ', err);
                }
            });
        } else if (spec in this.tails) {
            break; // flush it
        }
    }
    if (!spec) return; // all states flushed

    this.pulling = new Date().getTime();
    // Request the host to send us the full state patch.
    // Only a live object can integrate log tail into the state,
    // so we use this trick. As object lifecycles differ in Host
    // and FileStorage we can't safely access the object directly.
    this._host.deliver(ti.add(this.time(), '!').add('.on'), '.init!0', this);
};

FileStorage.prototype.patch = function fsPatch(spec, patch) {
    var ti = spec.filter('/#'),
        self = this;
    if (!patch._version) { // no full state, just the tail
        return this.appendToLog(ti, patch._tail);
    } 
    // in the [>on <patch1 <reon >patch2] handshake pattern, we
    // are currently at the patch2 stage, so the state in this
    // patch also includes the tail which was sent in patch1
    delete this.tails[ti];

    var save = JSON.stringify(patch),
        fn = this.stateFileName(ti),
        dir = path.dirname(fn);
    // I believe FAT is cached (no disk seek) so existsSync()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    // finally, send JSON to the file
    fs.writeFile(fn, save, function onSave(err) {
        if (err) {
            console.error('failed to flush object state; terminating', err);
            self.logFile.end(function () { process.exit(121); });
        } else { 
            self.pulling = 0;
            self.pullState(ti); // may request next object
        }
    });

};

FileStorage.prototype.op = function appendOp(spec, val) {
    var ti = spec.filter('/#'),
        vo = spec.filter('!.'),
        o = {};
    o[vo] = val;
    this.appendToLog(ti, o);
};

FileStorage.prototype.logFileName = function (count) {
    return this.dir + '/_log/log' + Spec.int2base(count, 8);
};

FileStorage.prototype.parseLogFileName = function (name) {
    var m = /.*?(\w{8})$/.exec(name); 
    return Spec.base2int(m[1]);
};

FileStorage.prototype.stateFileName = function (spec) {
    var base = this.dir + '/' + spec.type() + '/';
    return base + spec.id(); // TODO hashing (issue: may break FAT caching?)
};

// Once the current log file exceeds some size, we start a new one.
// Once all ops are saved in object-state files, a log file is rm'ed.
FileStorage.prototype.rotateLog = function rotateLog () {
    if (this.logFile) {
        this.logFile.end();
        this.dirtyQueue.push(this.logCount);
    }
    this.logFile = fs.createWriteStream(this.logFileName(++this.logCount));
    this.logFile.on('error', function (err) {
        console.error('TERRIBLE ERROR',err);
    });
    this.logSize = 0;
};

FileStorage.prototype.MAX_LOG_SIZE = 1 << 15;

FileStorage.prototype.on = function (spec, base, replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#'),
        self = this,
        statefn = this.stateFileName(ti);


    // read in the state
    fs.readFile(statefn, function onRead(err, data){
        var state = err ? {_version: '!0'} : JSON.parse(data.toString()),
            tail = self.tails[ti];

        if (tail) {
            state._tail = state._tail || {};
            for (var s in tail) state._tail[s] = tail[s];
        }

        var tiv = ti.add(spec.version(), '!');

        replica.deliver( tiv.add('.patch'), state, self );
        replica.deliver( tiv.add('.reon'), Swarm.stateVersionVector(state), self );
    });

};

FileStorage.prototype.off = function (spec, value, src) {
    // if (this.tails[ti]) TODO half-close
    src.deliver(spec.set('.reon'), '', this);
};

// Load all existing log files on startup.
// Object-state files will be read on demand but we can't seek inside
// log files so load 'em as this.tails[]
FileStorage.prototype.loadTails = function loadTails() {
    var path = this.dir + '/_log',
        logs = fs.readdirSync(path);
    for (var i = 0; i < logs.length; i++) {
        var log = logs[i],
            count = this.parseLogFileName(log);
        this.logCount = Math.max(count, this.logCount);

        var data = fs.readFileSync(this.dir + '/_log/' + log),
            json = '[' + data.toString() + '{}]',
            arr = JSON.parse(json);

        for (var j = 0; j < arr.length; j++) {
            var block = arr[j];
            for (var tidoid in block) {
                var tail = this.tails[tidoid],
                    ops = block[tidoid];
                if (!tail) {
                    tail = this.tails[tidoid] = {};
                    this.dirtyQueue.push(tidoid);
                }
                for (var vidop in ops) tail[vidop] = ops[vidop];
            }
            this.dirtyQueue.push(this.logCount);
        }
    }
};

//
function EinarosWSStream(ws) {
    var self = this,
        ln = this.lstn = {},
        buf = [];

    if (typeof ws === 'string') { // url passed
        ws = new ws_lib(ws);
    }
    this.ws = ws;
    if (ws.readyState !== 1/*WebSocket.OPEN*/) this.buf = buf; //will wait for "open"
    ws.on('open', function () {
        buf.reverse();
        self.buf = null;
        while (buf.length) self.write(buf.pop());
    });
    ws.on('close', function () { ln.close && ln.close() });
    ws.on('message', function (msg) {
        try {
            console.log(msg);
            ln.data && ln.data(msg)
        } catch(ex) {
            console.error('message processing fails',ex);
            ln.error && ln.error(ex.message)
        }
    });
    ws.on('error', function (msg) { ln.error && ln.error(msg) });
}
exports.EinarosWSStream = EinarosWSStream;

EinarosWSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

EinarosWSStream.prototype.write = function (data) {
    if (this.buf)
        this.buf.push(data.toString());
    else
        this.ws.send(data.toString());
};

Swarm.streams.ws = Swarm.streams.wss = EinarosWSStream;

