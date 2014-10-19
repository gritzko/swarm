"use strict";
var path = require('path');
var env = require('./env');
var Spec = require('./Spec');
var Storage = require('./Storage');
var SecondPreciseClock = require('./SecondPreciseClock');
var levelPackager = require('level-packager');

/** LevelDB is a perfect local storage: string-indexed, alphanumerically
  * sorted, stores JSON with minimal overhead. Last but not least, has
  * the same interface as IndexedDB. */
function LevelStorage (filename, options, callback) {
    if (!options) options = {};
    if (options.constructor === Function) {
      callback = options;
      options = {};
    }
    var level;
    if (env.isServer) {
      level = levelPackager(require('level' + 'down')); // trick browserify
      this.isRoot = true;
    } else {
      level = levelPackager(require('level-js'));
      this.isRoot = false;
    }
    Storage.call(this);
    this._host = null; //will be set during Host creation
    this.filename = path.resolve(filename);
    this._id = 'lvl';
    this.logtails = {};

    var clock_fn = env.clock || SecondPreciseClock;
    this.clock = new clock_fn(this._id);

    var self = this;
    self.db = level(this.filename, options, function(err,db){
        self.db = db;
        callback && callback(err);
    });
}
LevelStorage.prototype = new Storage();
module.exports = LevelStorage;

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

    /*var stream = self.db.createReadStream({
        gt: ti+' ',
        lt: ti+'0'
    }).on('data', function (data) {
        console.log('>4DEL',data.key);
    }).on('error', function(err) {
        console.error('log trimming failed', err);
        stream.destroy();
    }).on('end', function() {
        // write the state
        stream.destroy();
    });*/

};

LevelStorage.prototype.writeOp = function (spec, value, cb) {
    var json = JSON.stringify(value);
    var ti = spec.filter('/#');
    if (!this.logtails[ti]) {
        this.logtails[ti] = [];
    }
    this.logtails[ti].push(spec.toString());
    console.log('>OP',spec.toString(),json);
    this.db.put(spec.toString(), json, function (err){
        err && console.error('op write error',err);
        cb(err);
    });
};


LevelStorage.prototype.readState = function (ti, callback) {
    var self = this;
    this.db.get(ti, function(err,value){
        if (err && !err.notFound) return callback(err);

        if ((err && err.notFound) || !value) {
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
    var tail = {};
    var stream = this.db.createReadStream({
        gt: ti+' ',
        lt: ti+'0'
    }).on('data', function (data) {
        var spec = new Spec(data.key);
        tail[spec.filter('!.')] = JSON.parse(data.value);
    }).on('end', function() {
        stream.destroy();
        self.logtails[ti] = [];
        for(var key in tail) {
            self.logtails[ti].push(key);
        }
        console.log('<TAIL',self._host && self._host._id,tail);
        callback(null, tail||null);
    }).on('error', function(err) {
        callback(err);
    });
};


LevelStorage.prototype.close = function (callback,error) {
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
      console.log('uncaught:', err, err.stack);
});
*/
