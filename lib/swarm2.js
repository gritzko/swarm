if (typeof require === 'function') {
    _ = require('underscore');
}

exports = ( function Swarm () {

var specQuants = {
    type: '/',
    id: '#',
    field: '.',
    method: '*',
    time: '!',
    author: '&',
    ssn: '+'
};
var specQuantOrder = '/#.*!&+'.match(/./g);
var specFields = {};
for(var f in specQuants)
    specFields[specQuants[f]] = f;

function Spec (spec) {
    var t = this, m=[];
    t.type=t.id=t.field=t.method=t.time=t.seq=t.author=t.ssn=null;
    while (m=Spec.reSpecTok.exec(spec))
        t[ specFields[ m[1] ] ] = m[2];
}
Spec.expandRegex = function (template,flags) {
    return new RegExp(template.replace(/=/g,'[\\w_]+'),flags||'');
};
Spec.reSpecTok = Spec.expandRegex('([\/\#\.\*\!\&\+])(=)','g');

Spec.prototype.toString = function () {
    var ret = [];
    for(var i=0; i<specQuantOrder.length; i++) {
        var q = specQuantOrder[i], fnm = specFields[q];
        if (this[fnm])
            ret.push(q,this[fnm]);
    }
    return ret.join('');
};

Spec.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
Spec.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)
Spec.reVid = Spec.expandRegex('(!=)(&=(\\+=)?)');
Spec.reSrc = Spec.expandRegex('(&=(\\+=)?)');
//    Spec.reSrcVid.lastIndex = 0;

Spec.iso2digits = function (iso,addMs) {
    if (iso.constructor===Date) iso=iso.toISOString();
    var digits = iso.replace(/[^\d]/g,'').substr(2,addMs?15:12);
    if (!/^\d{12,15}$/.test(digits)) throw new Error('malformed ISO date: '+iso);
    return digits;
};

Spec.reDateDigits = /\!?(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d{3})?/;

Spec.digits2iso = function (digits) {
    if (!/^\!?\d{12,15}$/.test(digits))
        throw new Error('malformed digits-only timestamp: '+digits);
    if (digits.length===13) digits=digits+'000'; // milliseconds
    var iso = digits.replace(Spec.reDateDigits,'20$1-$2-$3T$4:$5:$6.000Z');
    return iso;
};

Spec.ts = function (date,mayRepeat) {
    var iso=(date||new Date()).toISOString(), ms=false;
    var ts = Spec.iso2digits(iso);
    if (ts===Spec.lastTs) { 
        ts = Spec.iso2digits(iso,true);
        if (!mayRepeat && ts===Spec.lastTs)
            throw new Error('please use rate limits');
    } else
        Spec.lastTs = ts;
    return '!'+ts;
};

Spec.vid = function (date) {
    return Spec.ts(date) + Model.source; // Model?
};

Spec.as = function (s) {
    return s.constructor===Spec ? s : new Spec(s.toString());
};

Spec.ts2date = function (ts) {
    return new Date(iso);
};

Spec.ts2int = function (ts) {
    return Spec.ts2date(ts).getTime() - Spec.EPOCH;
};

Spec.getSrcVersionMap = function (vidMap) {
    return maxTs ? maxSrcTss : null;
};

/** Calculates a version vector for a given {field:vid} map */
Spec.getBase = function (vidMap) {
    if ('_vid' in vidMap) vidMap=vidMap['_vid'];
    var maxSrcTss={}, maxTs='';
    for(var field in vidMap) {
        var m = Spec.reVid.exec(vidMap[field]);
        var src = m[2], ts = m[1];
        if (ts>maxTs) maxTs = ts;
        if ( ts > (maxSrcTss[src]||'') )
            maxSrcTss[src] = ts;
    }
    if (!maxTs) return '';
    var maxDate = new Date(Spec.digits2iso(maxTs));
    var limMs = maxDate.getTime() - Spec.MAX_SYNC_TIME;
    var limTs = '!'+Spec.iso2digits(new Date(limMs));
    var ret = {'&_':limTs}; // TODO on sync: explicitly specify peer src base
    for(var src in maxSrcTss)
        if (maxSrcTss[src]>limTs)
            ret[src] = maxSrcTss[src]; // once
    return ret;
};

Spec.getDiff = function (base, obj) {
    var vids = obj._vid, m, ret=null;
    for(var field in vids) {
        var src = Spec.reSrc.exec(vids[field])[0];
        if ( vids[field] > (base[src]||base['&_']||'!') ) {
            ret = ret || {'_vid':{}};
            ret[field] = obj[field];
            ret._vid[field] = vids[field];
        }
    }
    return ret;
};

/**  Model (M of MVC)
 *   C of MVC invoke: local, RPC, logged
 * */

function Model (id) {
    this.init(id);
}

Model.prototype.init = function (id) {
    this._lstn = [];
    this._id = id;
    this._state = Model.EMPTY;
}
Model.EMPTY = 0;
Model.READY = 1;

/** on-off pattern is essentially an open/close handshake */
Model.prototype.on = function (key,ln,ext) {
    // ACL-read goes here

    this._lstn.push(key?{__key:key,ln:ln}:ln);

    /*if (ext.base) {
        var diff = this.diff(ext.base);
        if (diff)          // FIXME always even empty
            ln.set(this.spec(), diff, {src: this});
    }*/
    // TODO uplink
}

Model.prototype.off = function (key,ln,ext) {
    var i = this._lstn.indexOf(ln);
    if (i>=0) {

    } else {
        for(i=0; i<this._lstn.length; i++) {

        }
    }
    if (_lstn.length===1) // uplink only
        this.close();
}

Model.prototype.set = function (key,val,ext) {
    // bundled sigs: same vid only!!! {key:val},{vid:vid} or key,val.{vid:vid} then
    // create vid if none
    // ACL-write goes here
    if (this._acl) {
        if (letWriteList.indexOf(spec.author)===-1)
            throw new Error('no rights: the author is not on ACL');
    } else {
        // get new Spec(this._vid._).author
        //if (spec.author!==creator)
        //    throw new Error('no rights: not an author');
    }
    if (!this._state)
        this._state = Model.READY;
    var spec = Spec.as(key);
    // absorb state
    if (spec.method) {
        this[spec.method].call(this,val);
        // mark vid for further RPC oplog sync
    } else if (spec.field) {
        if (field.charAt(0)==='_') throw new Error('no access');
        // actually compare version ids
        this[spec.field] = val;
        // remember vids
    } else
        throw new Error();

    this.emit(key,val,ext);
}
Model.prototype._state = Model.EMPTY;

Model.prototype.emit = function (key,val,ext) {
    for(var i=0; i<this._lstn.length; i++){
        var ln = this._lstn[i];
        if (ln.__key) {
            if (ln.__key!==key)
                continue;
            ln = ln.ln;
        }
        if (ln.prototype===Function)
            ln(key,val,ext);     // deliver key:val  // TODO
        else
            ln.set(key,val,ext); // deliver spec:val
    }
}

Model.prototype.close = function () {
    for(var i=0; i<this._lstn.length; i++) {
        var ln = this._lstn[i];
        ln.off(this);
    }
};

/** convenience */
Model.on = function (spec,ln) {

};

Model.extend = function (fn,defaults) {
    var proto = fn.prototype;
    var fname = fn.name; // TODO ie
    defaults = defaults || {};
    _.extend(proto,Model.prototype);
    Model.types[fname] = fn;
    proto._type = fn._type = fname;
    proto._set = false;
    // introspect an empty object to find properties
    var sample = new fn();
    var props = [];
    for (var name in sample) {
        if (name.charAt(0)==='_') continue;
        if (!sample.hasOwnProperty(name)) continue;
        if (!Model.reCamelCase.test(name)) continue;
        props.push(name);
    }
    // extend the prototype
    for(var i=0; i<props.length; i++) {
        var propName = props[i];
        var capName = propName.charAt(0).toUpperCase()+propName.substr(1);
        (function def (name,Name) {
            proto['set'+Name] = function (val) {
                this.set(name,val);
            }
            proto['get'+Name] = function () {
                return this[name];
            }
        }) (propName,capName);
    }
};
Model.reCamelCase = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
Model.types = {};


return {
    Spec:Spec,
    Model:Model
};
      extend
}());

if (typeof window === 'object') {
    for(key in exports)
        window[key] = exports[key];
} else {
    module.exports = exports;
}
