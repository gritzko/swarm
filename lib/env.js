/** a really simplistic default hash function */
function djb2Hash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++)
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
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

    isServer: typeof(navigator)==='undefined',
    isBrowser: typeof(navigator)==='object',
    isWebKit: false,
    isGecko: false,
    isIE: false
};

if (typeof(navigator)==='object') {
    var agent = navigator.userAgent;
    env.isWebKit = /AppleWebKit\/(\S+)/.test(agent);
    env.isIE = /MSIE ([^;]+)/.test(agent);
    env.isGecko = /rv:.* Gecko\/\d{8}/.test(agent);
}

function plain_log (spec,val,object,host) {
    var method  ='log';
    switch (spec.op()) {
        case 'error': method = 'error'; break;
        case 'warn':  method = 'warn'; break;
    }
    console[method] (spec.toString(), val, object&&object._id, host&&host._id);
}

function css_log (spec, value, replica, host) {
//    var myspec = this.spec().toString(); //:(
    if (!host && replica && replica._host) host = replica._host;
    if (value.constructor.name==='Spec') value = value.toString();
    console.log(
            "%c%s  %c%s%c%s  %c%O  %c%s@%c%s",
            "color: #888",
                (env.multihost&&host&&host._id) || '',
//            "color: #246",
//                this.spec().toString(),
            "color: #024; font-style: italic",
                spec.toString(),
            "font-style: normal; color: #042",
                value,
            "color: #88a",
                (replica&&((replica.spec&&replica.spec().toString())||replica._id)) ||
                (replica?'no id':'undef'),
            "color: #ccd",
                replica&&replica._host&&replica._host._id
            //replica&&replica.spec&&(replica.spec()+
            //    (this._host===replica._host?'':' @'+replica._host._id)
    );
};

if (env.isWebKit || env.isGecko) env.log = css_log;
