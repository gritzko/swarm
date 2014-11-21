"use strict";
var env = require('./env');
var Spec = require('./Spec');
var Storage = require('./Storage');

/** LevelDB is a perfect local storage: string-indexed, alphanumerically
  * sorted, stores JSON with minimal overhead. Last but not least, has
  * the same interface as IndexedDB. */
function LevelStorage (id, options, callback) {
    Storage.call(this);
    this.options = options;
    this._host = null; // will be set by the Host
    this.db = options.db;
    this._id = id;
    this.filename = null;
    if (this.db.constructor===Function) {
        this.db = this.db(options.path||id);
    }
    this.logtails = {};
}
LevelStorage.prototype = new Storage();
module.exports = LevelStorage;
LevelStorage.prototype.isRoot = env.isServer;

LevelStorage.prototype.open = function (callback) {
    this.db.open(this.options.dbOptions||{}, callback);
};

LevelStorage.prototype.writeState = function (spec, state, cb) {
    console.log('>STATE',state);
    var self = this;
    var ti = spec.filter('/#');
    //var save = JSON.stringify(state, undefined, 2);
    if (!self.db) {
        console.warn('the storage is not open', this._host&&this._host._id);
        return;
    }

    var json = JSON.stringify(state);
    var cleanup = [], key;
    if (ti in this.logtails) {
        while (key = this.logtails[ti].pop()) {
            cleanup.push({
                key: key,
                type: 'del'
            });
        }
        delete this.logtails[ti];
    }
    console.log('>FLUSH',json,cleanup.length);
    self.db.put(ti, json, function onSave(err) {
        if (!err && cleanup.length && self.db) {
            console.log('>CLEAN',cleanup);
            self.db.batch(cleanup, function(err){
                err && console.error('log trimming failed',err);
            });
        }
        err && console.error("state write error", err);
        cb(err);
    });

};

LevelStorage.prototype.writeOp = function (spec, value, cb) {
    var json = JSON.stringify(value);
    var ti = spec.filter('/#');
    if (!this.logtails[ti]) {
        this.logtails[ti] = [];
    }
    this.logtails[ti].push(spec);
    console.log('>OP',spec.toString(),json);
    this.db.put(spec.toString(), json, function (err){
        err && console.error('op write error',err);
        cb(err);
    });
};


LevelStorage.prototype.readState = function (ti, callback) {
    var self = this;
    ti = ti.toString();
    this.db.get(ti, {asBuffer:false}, function(err,value){

        var notFound = err && /^NotFound/.test(err.message);
        if (err && !notFound) { return callback(err); }

        if ((err && notFound) || !value) {
            err = null;
            value = {_version: '!0'};
        } else {
            value = JSON.parse(value);
        }

        console.log('<STATE',self._host && self._host._id,value);
        callback(err, value);
    });
};


LevelStorage.prototype.readOps = function (ti, callback) {
    var self = this;
    var tail = {}, log = [];
    var i = this.db.iterator({
        gt: ti+' ',
        lt: ti+'0'
    });
    i.next(function recv(err,key,value){
        if (err) {
            callback(err);
            i.end(function(err){});
        } else if (key) {
            var spec = new Spec(key);
            var vo = spec.filter('!.');
            tail[vo] = JSON.parse(value.toString());
            log.push(vo);
            i.next(recv);
        } else {
            console.log('<TAIL',self._host && self._host._id,tail);
            self.logtails[ti] = ti in self.logtails ?
                self.logtails[ti].concat(log) : log;
            callback(null, tail);
            i.end(function(err){
                err && console.error("can't close an iter",err);
            });
        }
    });
};

LevelStorage.prototype.off = function (spec,val,src) {
    var ti = spec.filter('/#');
    delete this.logtails[ti];
    Storage.prototype.off.call(this,spec,val,src);
};

LevelStorage.prototype.close = function (callback,error) { // FIXME
    if (error) {
        console.log("fatal IO error", error);
    }
    if (this.db) {
        this.db.close(callback);
        this.db = null;
    } else {
        callback(); // closed already
    }
};

/*
process.on('uncaughtException', function(err) {
    CLOSE ALL DATABASES
});
*/
