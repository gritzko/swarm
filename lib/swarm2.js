if (typeof require === 'function') {
    _ = require('underscore');
}

exports = ( function Swarm () {

    //  S P E C I F I E R
    //  is a compound event id that fully and uniquely specifies a change.
    //  Specs include class, object id, timestamp, member/method affected
    //  and the author of the change. Every spec's token is prefixed with
    //  a "quant", i.e. a symbol in the range [!-/]. A serialized spec
    //  has a form of /ClassName#objectId.memberName!timeStamp&changeAuthor
    //  A token may have an optional extension prefixed with '+', e.g.
    //  &userName+sessionId or !timeStamp+serialNumber. Tokens are Base64.

    function Spec (spec) {
        var t = this, m=[];
        t.type=t.id=t.member=t.time=t.author=null;
        while (m=Spec.reQTokExt.exec(spec))
            switch (m[1]) {
                case '/': t.type=m[2]; break;
                case '#': t.id=m[2]; break;
                case '.': t.member=m[2]; break;
                case '!': t.time=m[2]; break;
                case '&': t.author=m[2]; break;
            }
    }
    Spec.rT = '[0-9A-Za-z_@]+';
    Spec.reTokExt = new RegExp('^(=)(?:\\+(=))?$'.replace(/=/g,Spec.rT));
    Spec.reQTokExt = new RegExp('([/#\\.!&])(=(?:\\+=)?)'.replace(/=/g,Spec.rT),'g');

    Spec.prototype.toString = function () {
        return  (this.type?'/'+this.type:'')+
                (this.id?'#'+this.id:'')+
                (this.member?'.'+this.member:'')+
                (this.time?'!'+this.time:'')+
                (this.author?'&'+this.author:'');
    };

    Spec.bare = function (tok) { return Spec.reTokExt.exec(tok)[1]; }
    Spec.ext = function (tok) { return Spec.reTokExt.exec(tok)[2]||''; }

    Spec.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
    Spec.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)

    Spec.iso2timestamp = function (iso) {
        if (iso.constructor===Date) iso=iso.toISOString();
        var digits = iso.replace(/[^\d]/g,'').substr(0,14);
        if (digits.length!==14) throw new Error('malformed ISO date: '+iso+', '+digits);
        return digits;
    };

    Spec.reTS = /^\!?(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\+[0-9A-Za-z_@]+)?$/;

    Spec.timestamp2iso = function (digits) {
        if (!Spec.reTS.test(digits)) throw new Error('malformed timestamp: '+digits);
        return digits.replace(Spec.reTS,'$1-$2-$3T$4:$5:$6.000Z');
    };

    Spec.timestamp2date = function (ts) {
        return new Date(Spec.timestamp2iso(ts));
    };

    Spec.timestamp = function (date,mayRepeat) {
        var iso=(date||new Date()).toISOString();
        var ts = Spec.iso2timestamp(iso);
        if (ts===Spec.lastTs) {
            var extStr = (++Spec.extCount).toString(32);
            while (extStr.length<3) extStr='0'+extStr;
            ts = ts + '+' + extStr;
        } else {
            Spec.lastTs = ts;
            Spec.extCount = 0;
        }
        return '!'+ts;
    };
    Spec.lastTs = '';
    Spec.extCount=0;


/** Calculates a version vector for a given {member:vid} map */
Spec.getBase = function (vidMap) {
    if ('_vid' in vidMap) vidMap=vidMap['_vid'];
    var maxSrcTss={}, maxTs='';
    for(var member in vidMap) {
        var spec = new Spec(vidMap[member]);
        if (spec.time>maxTs) maxTs = spec.time;
        if ( spec.time > (maxSrcTss[spec.author]||'') )
            maxSrcTss[spec.author] = spec.time;
    }
    if (!maxTs) return '';
    var maxDate = new Date(Spec.timestamp2iso(maxTs));
    var limMs = maxDate.getTime() - Spec.MAX_SYNC_TIME;
    var limTs = '!'+Spec.iso2timestamp(new Date(limMs));
    var ret = {'&_':limTs}; // TODO on sync: explicitly specify peer src base
    for(var src in maxSrcTss)
        if ('!'+maxSrcTss[src]>limTs)
            ret['&'+src] = '!'+maxSrcTss[src]; // once
    return ret;
};

Spec.getDiff = function (base, obj) {
    var vids = obj._vid, m, ret=null;
    for(var member in vids) {
        var spec = new Spec(vids[member]);
        if ( vids[member] > (base[spec.author]||base['&_']||'!') ) {
            ret = ret || {'_vid':{}};
            ret[member] = obj[member];
            ret._vid[member] = vids[member];
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
    } else if (spec.member) {
        if (member.charAt(0)==='_') throw new Error('no access');
        // actually compare version ids
        this[spec.member] = val;
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
