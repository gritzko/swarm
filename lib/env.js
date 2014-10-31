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

function plain_log(object, spec, val, src) {
    var method = 'log';
    switch (spec.op()) {
    case 'error':
        method = 'error';
        break;
    case 'warn':
        method = 'warn';
        break;
    }
    var host = '@' + ((object && object._host && object._host._id) || '');
    var obj = object && ('/' + object._type + '#' + object._id) || '';
    var source = src && src._id || '';
    console[method](host + obj, spec.toString(), val, source);
}
