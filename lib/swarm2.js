/*if (typeof require === 'function') {
    _ = require('underscore');
}*/

exports = ( function Swarm () {

    Swarm.isBrowser = typeof(document)=='object';
    Swarm.isServer = !Swarm.isBrowser;

    // borrowed from Underscore
    Swarm.extend = function(obj) {
        for(var i=1; i<arguments.length; i++) {
            var arg = arguments[i];
            if (!arg) continue;
            for (var prop in arg)
                obj[prop] = arg[prop];
        }
        return obj;
    };

    //  S P E C I F I E R
    //  is a compound event id that fully and uniquely specifies a change.
    //  Specs include class, object id, timestamp, member/method affected
    //  and the author of the change. Every spec's token is prefixed with
    //  a "quant", i.e. a symbol in the range [!-/]. A serialized spec
    //  has a form of /ClassName#objectId.memberName!timeStamp&changeAuthor
    //  A token may have an optional extension prefixed with '+', e.g.
    //  &userName+sessionId or !timeStamp+serialNumber. Tokens are Base64.

    var Spec = Swarm.Spec = function Spec (copy) {
        var t = this;
        t.type=t.id=t.member=t.time=t.author=null;
        if (!copy) return;
        if (copy.constructor===Spec) {
            t.type = copy.type;
            t.id = copy.id;
            t.member = copy.member;
            t.time = copy.time;
            t.author = copy.author;
        } else if (copy._id && copy._type) {
            t.type = copy._type;
            t.id = copy._id;
        } else {
            Spec.as(copy.toString(),'.',this);
        }
    };

    Spec.as = function as (spec,defaultQuant,t) {
        var t = t||new Spec();
        var m=[];
        t.type=t.id=t.member=t.time=t.author=null;
        if (Spec.reTokExt.test(spec) && defaultQuant)
            spec = defaultQuant + spec;
        while (m=Spec.reQTokExt.exec(spec))
            switch (m[1]) {
                case '/': t.type=m[2]; break;
                case '#': t.id=m[2]; break;
                case '.': t.member=m[2]; break;
                case '!': t.time=m[2]; break;
                case '&': t.author=m[2]; break;
            }
        return t;
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

    // Considers this specifier in the context of another; returns
    // the difference. For example, `/a#b.c` within `/a#b` is `.c`.
    // `/a#b` within `/a#b.c` returns `null` (because the latter
    // specifier is more specific).
    Spec.prototype.within = function (scope) {
        var copy = new Spec(this);
        for(var f in copy)
            if (copy.hasOwnProperty(f))
                if (scope[f])
                    if (scope[f]===copy[f])
                        copy[f]=null;
                    else
                        return null;
        return copy;
    };

    Spec.prototype.isEmpty = function () {
        return !this.type&&!this.id&&!this.member&&!this.time&&!this.author;
    };

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

    // R E L A Y  N O D E
    // Unified signature:
    // * key/specifier,
    // * value,
    // * source
    var EventRelayProto = {
        init: function (id) {
            this._id = id || this._id;
            this._lstn = [];
            //var up = this.uplink();
            //up.on(this.spec(),this);
        },
        spec: function() {
            return new Spec(this);//'/'+this._type + '#'+this._id;
        },
        /**  */
        on: function (filter,base,newln) {
            // Signature normalization; that's JavaScript, after all.
            if (arguments.length===1) {
                newln = filter;
                filter = null;
                base = null;
            } else if (arguments.length===2) {
                newln = base;
                base = null;
            }
            if (typeof(newln)==='function')
                newln = {set:newln}; // TODO backward-compat?
            filter = new Spec(filter);
            filter.within(this.spec());
            // We expect filtered listeners to be of an exception
            // so we wrap them with a standard interface.
            if (!filter.isEmpty()) {
                newln = {
                    filter:filter,
                    ln: newln,
                    set:function(spec,value,src){
                        if (spec.within(this.filter))
                            this.ln.set(spec,value,src);
                    }
                };
            }
            // The actual job to do.
            this.respond(filter,base,newln); // diff and/or reciprocal on
            this._lstn.push(newln);
            if (filter.isEmpty() && typeof(newln.reOn)==='function')
                newln.reOn(null,null,this); // TODO base
        },
        /** Reciprocal `on` */
        reOn: function (spec,base,newln) {
            // an internal method, no signature normalization needed
            this.respond(spec,base,newln);
            this._lstn.push(newln);
        },
        /** may respond with a diff */
        respond: function (spec,base,src) {
        },
        off: function (filter,novalue,oldln) {
            var lstn = this._lstn;
            var i = lstn.indexOf(oldln);
            if (i===-1) {
                for(var i=0; i<lstn.length && lstn[i].ln!==oldln; i++);
                if (i===lstn.length)
                    throw new Error('unknown listener');
            }
            lstn[i] = lstn[lstn.length-1];
            lstn.pop();
        },
        set: function (spec,val,src) {
            // signature normalization
            spec = new Spec(spec.toString(),'.');// FIXME scope
            this.emit(spec,val,src);
        },
        emit: function (spec,val,avoid) {
            var lstn = this._lstn;
            for(var i=0; i<lstn.length; i++)
                lstn[i]!==avoid && lstn[i].set(spec,val,this);
        }
    };

    // M O D E L

    var ModelProto = {
        set: function (spec,value,src) {
            // generate spec if needed - at the entry point
            if (!spec) {
            }
            // normalize sig
            if (typeof(key)==='object') {
                spec = value;
                src = spec;
                updates = key;
            } else
                updates[key] = value;
            // generate vid
            if (method) {
            } else {
                // scan/update options.tracked
            }
            if (changed)
                this.emit(spec,value,src);
        },
        findUplink: function () {
            return Swarm.findUplink(this.spec());
        },
        respond: function (spec,ln) {
            // send a diff
            this.diff();
            // ??? if (this._lstn.indexOf(ln)===-1)
            ln.on(spec,this);
        }
    };
    var Model = Swarm.Model = function (id) {
        this._id = id;
    };
    Swarm.extend(ModelProto,EventRelayProto);
    Swarm.extend(Model.prototype,ModelProto);


    Model.extend = function (fn,options) {
        var proto = fn.prototype;
        options = options || {};
        var fname = fn.name;
        Swarm.extend(proto,ModelProto);
        Model.types[fname] = fn;
        proto._type = fn._type = fname;
        //proto._set = false;
        if (!options.tracked) {
            // introspect an empty object to find properties
            options.tracked = {};
            var sample = new fn();
            for (var name in sample) {
                if (name.charAt(0)==='_') continue;
                if (!sample.hasOwnProperty(name)) continue;
                if (!Model.reCamelCase.test(name)) continue;
                options.tracked[name] = null;
            }
        }
        // extend the prototype
        for (var field in options.tracked) {
            var capitalizedName = field.charAt(0).toUpperCase()+field.substr(1);
            (function def (name,Name) {
                proto['set'+Name] = function (val) {
                    this.set(name,val);
                }
                proto['get'+Name] = function () {
                    return this[name];
                }
            }) (field,capitalizedName);
        }
    };
    Model.reCamelCase = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
    Model.types = {};

    var View = function (id,htmlTemplate) {
        // model.on
        id = Spec.as(id);
        if (!id.type || !id.id) throw 'need a /full#id';
        this._id;
        this.template = _.template(htmlTemplate);
        this.html = '';
        this.model = Swarm.on(id,this);
    }

    View.prototype.init = function () {
        var up = this.findUplink();
        up.on(this._id,this); // ????  spec
    };

    View.prototype.on = function () {
        // that's the model's reciprocal on
        // or superview?
    };

    View.prototype.off = function () {
        // nevermind
    };

    View.prototype.set = function (key,val,spec,src) {
        // original vs relayed set()
        if (!spec || !Spec.as(spec).time)
            return this.model.set(key,val,spec,this);
        this.render();
        if (Swarm.isServer)
            return;
        var container = document.getElementById(this.spec());
        if (!container)
            return this.close();
        // preserve nested elements
        container.innerHTML = this.html;
        // insert subelements
        container.getElementsByTagName('ins');
        for(;;);
            // if have element => reinsert
            // otherwise: create child view
    };

    View.prototype.render = function () {
        this.html = this.template(this.model);
    };

    View.extend = function () {}; //extend;

    function Transport () {
    }

    Transport.prototype.on = function (spec,ln) {
        this._lstn[_id] = ln;
        this.pipe.send(specOn,ln.getBase?ln.getBase():'');
        // there is a mistery here
        // * whether we keep a map of listeners and multiplex
        // * or we go Swarm>Class>Object
        // * once we have no listeners we will not close anyway 
        // * practical: we need a list of replicas to relink
        // * removing a listener might become tedious with 10000 entries
        // * reciprocal `on`: need a memo on every outstanding `on`
        //
        // local listeners are listed by id => may distinguish incoming vs
        // reciprocal `on` DONE  {id:listener}
    };

    Transport.prototype.off = function (spec,ln) {
    };

    // form inside
    Transport.prototype.set = function (key,val,spec,src) {
        if (spec==this.emittedSpec) return;
        this.pipe.send();
    };

    Transport.prototype.emit = function (key,val,spec,src) {
        spec = Spec.as(spec);
        var classobj = '/'+spec.type+'#'+spec.id;
        this._lstn[classobj].set(key,val,spec,this);
    };


/** Calculates a version vector for a given {member:vid} map */
Spec.getBase = function (vidMap) {
    if ('_vid' in vidMap) vidMap=vidMap['_vid'];
    if (vidMap.constructor===String)
        return { '_': new Spec(vidMap).time };
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
    var limTs = Spec.iso2timestamp(new Date(limMs));
    var ret = {'_':limTs}; // TODO on sync: explicitly specify peer src base
    for(var src in maxSrcTss)
        if (maxSrcTss[src]>limTs)
            ret[src] = maxSrcTss[src]; // once
    return ret;
};

Spec.getDiff = function (base, obj) {
    var vids = obj._vid, m, ret=null;
    for(var member in vids) {
        var spec = new Spec(vids[member]);
        if ( vids[member] > '!'+(base[spec.author]||base['&_']||'') ) {
            ret = ret || {'_vid':{}};
            ret[member] = obj[member];
            ret._vid[member] = vids[member];
        }
    }
    return ret;
};

/**  Model (M of MVC)
 *   C of MVC invoke: local, RPC, logged
 * *

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

/** on-off pattern is essentially an open/close handshake *
Model.prototype.on = function (key,ln,ext) {
    // ACL-read goes here

    this._lstn.push(key?{__key:key,ln:ln}:ln);

    /*if (ext.base) {
        var diff = this.diff(ext.base);
        if (diff)          // FIXME always even empty
            ln.set(this.spec(), diff, {src: this});
    }*
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
};
Model.prototype._state = Model.EMPTY;

Model.prototype.emit = function (key,val,ext) {
}

Model.prototype.close = function () {
    for(var i=0; i<this._lstn.length; i++) {
        var ln = this._lstn[i];
        ln.off(this);
    }
};
Model.types = {};
*/
    return {
        Swarm: Swarm,
        Spec:  Spec,
        Model: Model
    };

}());

if (typeof window === 'object') {
    for(key in exports)
        window[key] = exports[key];
} else {
    module.exports = exports;
}
