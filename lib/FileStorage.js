"use strict";

var fs = require('fs');
var path = require('path');
var env = require('./env');
var Spec = require('./Spec');
var Syncable = require('./Syncable');
var Storage = require('./Storage');
var Host = require('./Host');
var SecondPreciseClock = require('./SecondPreciseClock');

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
    this.log = path.resolve(dir,'_log');
    this._id = 'file';
    this.tail = {};

    var clock_fn = env.clock || SecondPreciseClock;
    this.clock = new clock_fn(this._id);

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

FileStorage.prototype.writeState = function (spec, state, cb) {
    var self = this;
    var ti = spec.filter('/#');
    var fileName = this.stateFileName(ti);
    var dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    var save = JSON.stringify(state);
    // dump JSON to the tmp file
    fs.writeFile(fileName, save, function onSave(err) {
        if (err) {
            console.error("failed to flush state; can't trim the log", err);
        } else {
            // tail is zeroed on state flush
            self.tails[ti] = {};
            // TODO may delete new unsaved ops; return the ops to self.tails
        }
        cb(err);
    });
};

FileStorage.prototype.writeOp = function (spec, value, cb) {
    var self = this;
    console.log('3',spec);
    var ti = spec.filter('/#');
    var vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = {});
    if (vm in tail) {
        console.error('op replay @storage');
        return;
    }
    var valStr = tail[vm] = JSON.stringify(value);
    var record = JSON.stringify('"'+spec+'":"'+valStr+'"');
    console.log('4',record);
    this.logFile.write (record, function onFail(err) {
        if (err) { self.close(err); }
        cb(err);
    });
};


FileStorage.prototype.readState = function (ti, callback) {
    var self = this;
    var statefn = this.stateFileName(ti);
    // read in the state
    fs.readFile(statefn, function onRead(err, data) { // FIXME fascism
        console.log(4,ti);
        var state = err ? {_version: '!0'} : JSON.parse(data.toString());
        callback(null,state);
    });
};


FileStorage.prototype.readOps = function (ti, callback) {
    var tail = this.tails[ti];
    if (tail) {
        var unjsoned = {};
        for(var key in tail) {
            unjsoned[key] = JSON.parse(tail[key]);
        }
        tail = unjsoned;
    }
    callback(null, unjsoned);
};


FileStorage.prototype.close = function (error) {
    if (error) {
        console.log("fatal IO error", error);
    }
    if (this.logFile) {
        this.logFile.end('}', function () {
            if (error) {
                process.exit(-1); // TODO make it a parameter
            }
        });
        this.logFile = null;
    }
};


FileStorage.prototype.rotateLog = function () {
    var self = this;
    if (this.logFile) {
        this.logFile.end('}');
    }

    this.logFile = fs.createWriteStream(this.log); // TODO file swap
    this.logFile.on('error', function (err) {
        self.close(err);
    });

    var json = JSON.stringify(this.tails);
    json = json.replace(/\}\s*$/,'\n'); // open-ended JSON

    this.logFile.write (json, function onFail(err) {
        if (err) { self.close(err); }
    });

};

FileStorage.prototype.loadLog = function () {
    var self = this;
    if (!fs.existsSync(this.log)) {
        return;
    }
    var json = fs.readFileSync(this.log, {encoding:"utf8"});
    if (!json) { return; }
    console.log('>>>',json,'<<<');
    if (json.charAt(json.length-1)!=='}') {
        json = json + '}'; // open-ended JSON
    }
    this.tails = JSON.parse(json);
};
