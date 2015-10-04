"use strict";
var fs = require('fs');
var path = require('path');
var env = require('./env');
var Spec = require('./Spec');
var Storage = require('./Storage');

/**
 * An improvised filesystem-based storage implementation.
 * Objects are saved into separate files in a hashed directory
 * tree. Ongoing operations are streamed into a log file.
 * One can go surprisingly far with this kind of an approach.
 * https://news.ycombinator.com/item?id=7872239 */
function FileStorage (dir) {
    Storage.call(this);
    this._host = null; //will be set during Host creation
    this.dir = path.resolve(dir);
    if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir);
    }
    this._id = 'file';
    this.tail = {};

    this.loadLog();
    this.rotateLog();
}
FileStorage.prototype = new Storage();
module.exports = FileStorage;

FileStorage.prototype.stateFileName = function (spec) {
    var base = path.resolve(this.dir, spec.type());
    var file = path.resolve(base, spec.id());
    return file; // TODO hashing?
};

FileStorage.prototype.logFileName = function () {
    return path.resolve(this.dir, "_log");
};

FileStorage.prototype.writeState = function (spec, state, cb) {
    var self = this;
    var ti = spec.filter('/#');
    var fileName = this.stateFileName(ti);
    var dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    var save = JSON.stringify(state, undefined, 2);
    // dump JSON to the tmp file
    delete self.tails[ti]; // TODO save 'em in case write fails
    fs.writeFile(fileName, save, function onSave(err) {
        if (err) {
            console.error("failed to flush state; can't trim the log", err);
        }
        cb(err);
    });
};

FileStorage.prototype.writeOp = function (spec, value, cb) {
    var self = this;
    var ti = spec.filter('/#');
    var vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = {});
    if (vm in tail) {
        console.error('op replay @storage',vm,new Error().stack);
        return;
    }
    var clone = JSON.parse(JSON.stringify(value)); // FIXME performance please
    tail[vm] = clone;
    var record = ',\n"'+spec+'":\t'+JSON.stringify(clone);
    this.logFile.write (record, function onFail(err) {
        if (err) { self.close(null,err); }
        cb(err);
    });
};


FileStorage.prototype.readState = function (ti, callback) {
    var statefn = this.stateFileName(ti);
    // read in the state
    fs.readFile(statefn, function onRead(err, data) { // FIXME fascism
        var state = err ? {_version: '!0'} : JSON.parse(data.toString());
        callback(null,state||null); // important: no state is "null"
    });
};


FileStorage.prototype.readOps = function (ti, callback) {
    var tail = this.tails[ti];
    if (tail) {
        var unjsoned = {};
        for(var key in tail) {
            unjsoned[key] = tail[key];
        }
        tail = unjsoned;
    }
    callback(null, tail||null);
};


FileStorage.prototype.close = function (callback,error) {
    if (error) {
        console.log("fatal IO error", error);
    }
    if (this.logFile) {
        this.rotateLog(true, callback);
    } else {
        callback();
    }
};


FileStorage.prototype.rotateLog = function (noOpen, callback) {
    var self = this;
    if (this.logFile) {
        this.logFile.end('}', callback);
        this.logFile = null;
        callback = undefined;
    }

    if (!noOpen) {

        if (fs.existsSync(this.logFileName())) {
            fs.rename(this.logFileName(),this.logFileName()+'.bak');
        }
        this.logFile = fs.createWriteStream(this.logFileName()); // TODO file swap
        this.logFile.on('error', function (err) {
            self.close(null,err);
        });

        var json = JSON.stringify(this.tails, undefined, 2);
        json = '{"":\n' + json; // open-ended JSON

        this.logFile.write (json, function onFail(err) {
            if (err) { self.close(null,err); }
        });

    }

    if (callback) {
        callback();
    }

};

FileStorage.prototype.loadLog = function () {
    if ( !fs.existsSync(this.logFileName()) ) {
        return;
    }
    var json = fs.readFileSync(this.logFileName(), {encoding:"utf8"});
    if (!json) { return; }
    var log;
    try {
        log = JSON.parse(json);
    } catch (ex) {
        // open-ended JSON
        log = JSON.parse(json + '}');
    }
    this.tails = log[''];
    delete log[''];
    for(var s in log) {
        var spec = new Spec(s);
        if (spec.pattern()==='/#!.') {
            var ti = spec.filter('/#');
            var vm = spec.filter('!.');
            var tail = this.tails[ti] || (this.tails[ti] = {});
            tail[vm]  = log[spec];
        }
    }
};
