"use strict";

/** a really simplistic default hash function */
function djb2Hash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash;
}

var env = module.exports = {
    // maps URI schemes to stream implementations
    streams: {},
    getStreamConstructor: getStreamConstructor,
    // the default host
    localhost: undefined,
    // whether multiple hosts are allowed in one process
    // (that is mostly useful for testing)
    multihost: false,
    // hash function used for consistent hashing
    hashfn: djb2Hash,

    log: plain_log,
    debug: false,
    trace: false,

    isServer: typeof(navigator) === 'undefined',
    isBrowser: typeof(navigator) === 'object',
    isWebKit: false,
    isGecko: false,
    isIE: false,
    clockType: undefined // default
};

if (typeof(navigator) === 'object') {
    var agent = navigator.userAgent;
    env.isWebKit = /AppleWebKit\/(\S+)/.test(agent);
    env.isIE = /MSIE ([^;]+)/.test(agent);
    env.isGecko = /rv:.* Gecko\/\d{8}/.test(agent);
}

function getStreamConstructor(url) {
    var m = url.match(/(\w+):.*/);
    if (!m) {
        throw new Error('invalid url ' + url);
    }
    var proto = m[1].toLowerCase();
    var res = env.streams[proto];
    if (!res) {
        throw new Error('protocol not supported: ' + proto);
    }
    return res;
}

function plain_log(object, spec, val, src) {
    var op = spec || '';
    if (op.constructor.name === 'Spec') {
        op = spec.op();
    }
    var method;
    switch (op) {
    case 'error':
        method = 'error';
        break;
    case 'warn':
        method = 'warn';
        break;
    default:
        method = 'log';
    }
    var host = env.multihost ? '@' + (object && object._host && object._host._id || '') : '';
    var obj = object && object.toString() || '';
    var source = src && (typeof src === 'function' ? src.name : src.toString()) || '';
    console[method](host, obj, spec.toString(), val, source);
}
