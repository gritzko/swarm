"use strict";
var env = require('./env');
var Spec = require('./Spec');
var Storage = require('./Storage');

/**
 * Adaptor for Redis
 * @param {{redis:object, redisConnectParams:{unixSocket:string?, port:number?, host:string?, options:object}}} options
 *
 * <code>
 *      var storage = new Swarm.RedisStorage('dummy', {
 *          redis: require('redis'),
 *          redisConnectParams: {
 *              port: 6379,
 *              host: '127.0.0.1',
 *              options: {}
 *          }
 *      });
 *      storage.open(callback);
 * </code>
 *
 * @TODO storage opening by host
 */
function RedisStorage (id, options) {
    Storage.call(this);
    this.options = options;
    this._host = null; // will be set by the Host
    this.redis = options.redis;
    this.redisConnectParams = options.redisConnectParams || {
        unixSocket: undefined,
        port: 6379,
        host: '127.0.0.1',
        options: {}
    };
    this.db = null;
    this._id = id;
    this.logtails = {};
}
RedisStorage.prototype = new Storage();
module.exports = RedisStorage;
RedisStorage.prototype.isRoot = env.isServer;

var TAIL_FIELD_SUFFIX = ":log";

RedisStorage.prototype.open = function (callback) {
    var params = this.redisConnectParams;
    if (params.unixSocket) {
        this.db = this.redis.createClient(params.unixSocket, params.options || {});
    } else {
        this.db = this.redis.createClient(params.port || 6379, params.host || '127.0.0.1', params.options || {});
    }
    this.db.once('ready', callback);
};

RedisStorage.prototype.writeState = function (spec, state, cb) {
    console.log('>STATE',state);
    var self = this;
    var ti = spec.filter('/#');
    //var save = JSON.stringify(state, undefined, 2);
    if (!self.db) {
        console.warn('the storage is not open', this._host && this._host._id);
        return;
    }

    var json = JSON.stringify(state);
    var cleanup = this.logtails[ti] || [];
    delete this.logtails[ti];

    console.log('>FLUSH',json,cleanup.length);
    self.db.set(ti, json, function onSave(err) {
        if (!err && cleanup.length && self.db) {
            console.log('>CLEAN',cleanup);
            cleanup.unshift(ti + TAIL_FIELD_SUFFIX);
            self.db.hdel(cleanup, function (err, entriesRemoved) {
                err && console.error('log trimming failed',err);
            });
        }
        err && console.error("state write error", err);
        cb(err);
    });

};

RedisStorage.prototype.writeOp = function (spec, value, cb) {
    var ti = spec.filter('/#');
    var vo = spec.filter('!.');
    spec = spec.toString();
    var json = JSON.stringify(value);
    console.log('>OP', spec, json);

    // store spec in logtail
    var log = this.logtails[ti] || (this.logtails[ti] = []);
    log.push(vo);
    // save op in redis
    var logFieldName = ti + TAIL_FIELD_SUFFIX;
    this.db.hset(logFieldName, vo, json, function (err) {
        err && console.error('op write error',err);
        cb(err);
    });
};

RedisStorage.prototype.readState = function (ti, callback) {
    var self = this;
    this.db.get(ti.toString(), function (err, value){
        if (err) {
            return callback(err);
        }

        if (!value) {
            value = {_version: '!0'};
        } else {
            value = JSON.parse(value);
        }

        console.log('<STATE', self._host && self._host._id, value);
        callback(null, value);
    });
};

RedisStorage.prototype.readOps = function (ti, callback) {
    var self = this;
    var fieldName = ti + TAIL_FIELD_SUFFIX;
    this.db.hgetall(fieldName, function (err, res) {
        if (err) {
            return callback(err);
        }
        console.log('<TAIL', self._host && self._host._id, tail);
        var tail = {};
        var log =  self.logtails[ti] || (self.logtails[ti] = []);
        if (res) {
            for (var vo in res) {
                tail[vo] = JSON.parse(res[vo]);
                log.push(vo);
            }
        }
        callback(null, tail);
    });
};

RedisStorage.prototype.off = function (spec,val,src) {
    var ti = spec.filter('/#');
    delete this.logtails[ti];
    Storage.prototype.off.call(this, spec, val, src);
};

RedisStorage.prototype.close = function (callback,error) { // FIXME
    if (error) {
        console.log("fatal IO error", error);
    }
    if (this.db) {
        this.db.unref();
        this.db.get('fakeField', function (err, val) {
            callback(err);
        });
        this.db = null;
    } else {
        callback(); // closed already
    }
};
