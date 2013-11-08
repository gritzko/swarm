
//  S W A R M
//
//  Swarm is a framework/middleware for real-time synced objects. It makes
//  sense to explain why it exists in the first place. The current stage of
//  evolution of web apps has a multitude of client-side "views": iOS apps,
//  Android apps, HTML5 apps, third-party apps - all work with the same
//  "model" aka domain objects. A single user has an app open on his
//  iPhone, iPad, iMac, whatsnot - each has a replica of an object. Even
//  in the same browser there are tabs, each tab may have frames, each
//  frame hosts some replica of the model. So, web apps reach their
//  "Dropbox moment": suddenly, synchronization is the Big Thing.
//
//  Swarm implements a distributed variant of the MVC/MVP approach where
//  distributed replicas of the model are synchronized in the background
//  in real time, local and remote changes are processed uniformly. 
//  Swarm is object centric, ie a client retrieves a full replica of an
//  object by its id, while DB queries return lists of ids. That is
//  different from query-centric approaches where DB is proxied to the
//  client and queried for particular fields of objects.
//  We assume that both clients and front-end servers speak the Swarm
//  protocol. Front-end servers are no longer "stateless". Instead, they
//  subscribe to and relay model changes between clients, backend and each
//  other. Given the multitude of model replicas both on client and server
//  sides, the synchronization algorithm is unified. Its core part is
//  building a spanning tree of two-way subscriptions that let a "swarm"
//  of replicas to exchange mutation events. The tree repairs itself and
//  garbage-collects replicas as necessary. Resulting paths of update
//  propagation are dynamic; clients may potentially send updates directly
//  to each other by WebRTC. That necessitates the defence-in-depth
//  approach where every replica filters incoming mutations for data
//  validity and access rights.

exports = ( function () {

    /*var Swarm = {types:{}};

    Swarm.isBrowser = typeof(document)=='object';
    Swarm.isServer = !Swarm.isBrowser;
    */

    //  S P E C I F I E R
    //
    //  The Swarm aims to switch fully from the classic HTTP
    //  request-response client-server interaction pattern to continuous
    //  real-time synchronization (WebSocket), possibly involving
    //  client-to-client interaction (WebRTC) and client-side storage
    //  (WebStorage). That demands (a) unification of transfer and storage
    //  where possible and (b) transferring, processing and storing of
    //  fine-grained changes.
    //
    //  That's why we use compound event identifiers named *specifiers*
    //  instead of just regular "plain" object ids everyone is so used to.
    //  Our ids have to fully describe the context of every small change as
    //  it is likely to be delivered, processed and stored separately from
    //  the rest of the related state.  For every atomic operation, be it a
    //  field mutation or a method invocation, a specifier contains its
    //  class, object id, a field/method name and, most importantly, its
    //  version id.
    //
    //  A serialized specifier is a sequence of Base64 tokens each prefixed
    //  with a "quant". A quant for a class name is '/', an object id is
    //  prefixed with '#', a member with '.' and a version id with '!'.  A
    //  special quant '+' separates parts of each token.  For example, a
    //  typical version id looks like "!7AMTc+gritzko" which corresponds to
    //  a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko (see
    //  Spec.newVersion()).
    //
    //  A full serialized specifier looks like
    //        /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
    //  (a change of the 'done' field was made by @gritzko in some TodoItem
    //   which was created by the same author earlier)

    var Spec = Swarm.Spec = function Spec (copy) {
        for(var key in Spec.name2quant)
            this[key] = null;
        if (copy && copy.constructor===Spec) {
            for(var key in Spec.name2quant)
                this[key] = copy[key];
        } else if (copy) {
            copy = copy.toString();
            var m = [];
            while (m=Spec.reQTokExt.exec(copy)) //TODO correctness
                this[Spec.quant2name[m[1]]] = m[2];
        }
    };

    Spec.rT = '[0-9A-Za-z_~]+';
    Spec.reTokExt = new RegExp('^(=)(?:\\+(=))?$'.replace(/=/g,Spec.rT));
    Spec.reQTokExt = new RegExp('([/#\\.!\\*])(=(?:\\+=)?)'.replace(/=/g,Spec.rT),'g');
    Spec.quants = ['/','#','.','!','*'];
    Spec.tokens = ['type','id','member','version','action'];
    Spec.name2quant = {};
    Spec.quant2name = {};
    for(var i=0; i<Spec.quants.length; i++) {
        Spec.quant2name[Spec.quants[i]] = Spec.tokens[i];
        Spec.name2quant[Spec.tokens[i]] = Spec.quants[i];
    }

    Spec.prototype.toString = function () {
        var ret = '';
        for(var i=0; i<Spec.quants.length; i++) 
            if (this[Spec.tokens[i]])
                ret += Spec.quants[i] + this[Spec.tokens[i]];
        return ret;
    };

    Spec.is = function (str) { return !str.toString().replace(Spec.reQTokExt,'') };

    Spec.bare = function (tok) {
        var i=tok.indexOf('+');
        return i===-1 ? '' : tok.substr(0,i);
    };
    Spec.ext = function (tok) {
        var i=tok.indexOf('+');
        return i===-1 ? '' : tok.substr(i+1);
    };

    Spec.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
    Spec.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)

    Spec.int2base = function (i,padlen) {
        var ret = '';
        while (i) {
            ret = Spec.base64.charAt(i&63) + ret;
            i>>=6;
        }
        if (padlen)
            while (ret.length<padlen)
                ret = '0'+ret;
        return ret;
    };
    /** Swarm employs 30bit integer Unix-like timestamps starting epoch at
     *  1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
     *  several events are generated by the same process at the same second
     *  then sequence number is added so a timestamp may be more than 5
     *  chars. */
    Spec.date2ts = function (date) {
        var ret = [];
        var d = date.getTime();
        d -= Spec.EPOCH;
        var str64 = Spec.int2base((d/1000)|0,5);
        return str64;
    };

    // don't need it much
    Spec.ts2date = function () {
    };

    Spec.newVersion = function () {
        if (!Swarm.root.author) throw new Error('Swarm.author not set');
        if (Spec.frozen)
            return Spec.frozen;
        var ts = Spec.date2ts(new Date()), seq='';
        if (ts===Spec.lastTs)
            seq = Spec.int2base(++Spec.seq,2); // max ~4000Hz
        else
            Spec.seq = 0;
        Spec.lastTs = ts;
        return ts + seq + '+' + Swarm.root.author;
    };
    Spec.frozen = null;
    Spec.freezes = 0;
    Spec.lastTs = '';
    Spec.seq = 0;

    Spec.freeze = function () {
        if (!Spec.freezes++)
            Spec.frozen = Spec.newVersion();
    };
    Spec.thaw = function () { 
        if (!--Spec.freezes)
            Spec.frozen = null;
    }

    Spec.prototype.parent = function () {
        var ret = new Spec(this);
        if (ret.version) ret.version = null;
        else if (ret.member) ret.member = null;
        else if (ret.id) ret.id = null;
        else if (ret.type) ret.type = null;
        return ret;
    };

    Spec.prototype.child = function (id) {
        var child = new Spec(this);
        if (!child.type) child.type=id;
        else if (!child.id) child.id=id;
        else if (!child.member) child.member=id;
        else if (!child.version) child.version=id;
        return child;
    };

    Spec.base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';

    // 3-parameter signature
    //  * specifier (or a base64 string)
    //  * value anything but a function
    //  * source/callback - anything that can receive events
    Spec.normalizeSig3 = function (host, args) {
        var len = args.length;
        if (len===0 || len>3) throw new Error('invalid number of arguments');
        if (typeof(args[len-1])==='function')
            args[len-1] = {set:args[len-1]}; /// BAD
        if (len<3 && args[len-1] && typeof(args[len-1].set)==='function') {
            args[2] = args[len-1];
            args[len-1] = null;
        }
        if (!args[1] && args[0] && typeof(args[0])==='object' &&
                args[0].constructor!==Spec && args[0].constructor!==String) {
            args[1] = args[0];
            args[0] = null;
        }
        if (!args[0] || args[0].constructor!==Spec) {
            if (args[0] && args[0].toString().replace(Spec.reQTokExt,'')==='') {
                args[0] = new Spec(args[0].toString());
            } else {
                var spec = new Spec(host.scope());
                if (args[0])
                    spec[host._childKey] = args[0].toString();
                args[0] = spec;
            }
        }
    };


    //   E V E N T  R E L A Y  N O D E
    //
    // EventRelay is an "abstract class" for an event listener, albeit
    // somewhat generalized.  Incoming events are delivered and filtered
    // top-down, in line with the structure of specifiers: first to the
    // root singleton object `Swarm.root` then to the Type(class) object
    // then to the target object itself then to the member (field/method)
    // in question.  Quite predictably, 80% of top-down propagation logic
    // is shared between layers.
    //
    // The exact number of layers in this event processing cascade may
    // vary. The existence of actual objects and of the root singleton is
    // sort of inevitable. Type objects mostly exist as convenient hook
    // points for class-specific behavior that cannot be placed into an
    // instance. (For example, a permission to create an object cannot be
    // given within the object as it does not exist yet). Having "members"
    // (fields) as another layer of event-processing objects is not
    // mandatory; some types may skip that.  Still, once every value has a
    // version id attached, it is convenient to treat every field as a
    // small object. Also, that helps in dealing with complex datatypes
    // like Imperial lengths, for example.  Some hardcore MVCC datatypes
    // might potentially add yet another layer of "version" objects at the
    // bottom of the cascade to store multiple versions of a value.
    //
    // Although the concept of a cascade may seem heavyweight, it provides
    // plenty of convenient hook points and good separation of concerns.
    // That multi-layer mutation filtering is also necessary for the
    // defence-in-depth approach.
    function EventRelay (id) {
        this.init(id);
    }
    
    EventRelay.extend = function(fn,own) {
        if (typeof(fn)!=='function') {
            if (typeof(fn)!=='string')
                throw new Error('1st argument: constructor or class name');
            var id = fn;
            fn = function SomeEventRelayNode(id,val) {this.init(id,val)};
            fn.id = id;
        } else
            fn.id = fn.name;
        var fnproto = fn.prototype, myproto = this.prototype;
        for (var prop in myproto)
            fnproto[prop] = myproto[prop];
        for (var prop in own)
            fnproto[prop] = own[prop];
        for(var prop in this)
            if (typeof(this[prop])==='function')
                fn[prop] = this[prop]; // ???
        //fnproto._super = myproto;
        fn.extend = EventRelay.extend;
        return fn;
    };


    EventRelay.extend(EventRelay,{ // :)

        init : function (id) {
            if (id && id.constructor===Spec) {
                this._id = id[this._specKey];
            } else if (id && id.constructor===String) {
                this._id = id;
                arguments[0] = this.scope(); // well...
            } else {
                this._id = Spec.newVersion();
            }
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], parent=arguments[2];
            this._lstn = null;
            // _id or _parent may be defined in the prototype
            
            this._children = this._children || {};

            // note: scope-parent trick is for out-of-context creation like new MyModel('id')
            parent = parent || Swarm.root.obtain(this.scope().parent());
            if (this._id in parent._children)
                throw new Error('duplicate instantiation: '+spec); // TODO dup detecting constr
            parent._children[this._id] = this;

        },

        child: function (id) {
            return this._children[id];
        },

        // descends the entity hierarchy to find an object by the specifier;
        // may construct objects in the process
        obtain: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            var pick = spec[this._childKey];
            if (!pick) return this;
            if (pick in this._children)
                return this._children[pick].obtain(spec);
            if (!this._defaultChild)
                throw new Error('no such child: '+spec); // TODO Swarm's def child - value
            return new (this._defaultChild)(pick).obtain(spec,this._defaultChildValue,this);
        },

        /** Delivers an event to the target entity, then feeds it to the appropriate
         *  method. Checks rights, invokes listeners, etc. This method is the mapping
         *  from specifiers to objects. */
        deliver: function (action,spec,value,lstn) {
            var ret = undefined;
            if (this.acl && !this.acl(action,spec,'set',lstn))
                throw new Error('access denied: '+spec);
            if ((action==='set' || !action) && this.validate && !this.validate(spec,value,lstn))
                throw new Error('invalid value: '+spec);
            var childId = this._childKey && spec[this._childKey];
            if (childId) { // FIXME  .on .off fits the childid def
                var child = this._children[childId];
                if (!child) {
                    if (!this._defaultChild)
                        throw new Error('child unknown: '+spec);
                    child = this._children[childId] = new this._defaultChild(childId,{},this);
                }
                ret = child.deliver(action,spec,value,lstn);
            }else{
                switch (action){
                    case 'on':
                    case 'once':
                    case 'reOn':
                        ret = this.on(spec,value,lstn);
                        break;
                    case 'off':
                    case 'reOff':
                        ret = this.off(spec,value,lstn);
                        break;
                    case 'err':
                        ret = this.err(spec,value,lstn);
                        break;
                    case 'set':
                    default:
                        ret = this.set(spec,value,lstn);
                }
            }
            // may emit events at every layer of the event cascade
            if (action=='set' && (this._lstn || this._reactions))
                this.emit(spec,value,lstn);
            return ret;
        },

        on: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            if (spec[this._childKey]) // THINK incomplete deliver path FIXME weird
                return this.deliver('on',spec,value,lstn);
            this._lstn || (this._lstn=[]);
            this._lstn.push(lstn);
        },

        off: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            if (spec[this._childKey])
                return this.deliver('off',spec,value,lstn);
            if (!this._lstn) {
                console.warn('lstn is null');
                return;
            }
            var ll=this._lstn, i = ll.indexOf(lstn);
            if (!ll) return;
            if (i===-1) // maybe a wrapper
                for (i=0;i<ll.length && ll[i].set!==lstn.set; i++);
            if (i===ll.length)
                throw new Error('listener unknown: '+spec);
            ll.splice(i,1);
        },

        reOff: function reOff () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            spec.action = 'reOff';
            this.on(spec,value,lstn);
        },

        reOn: function reOn () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            spec.action = 'reOn';
            this.on(spec,value,lstn);
        },

        once: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            var proxy = {
                set: function (s,v,l) {
                    if (typeof(lstn)==='function')
                        lstn(s,v,l);
                    else
                        lstn.set(s,v,l);
                    l.off(spec,proxy);
                }
            };
            this.on(spec,value,proxy);
        },

        set:function () {
            throw new Error('set() notsupported at '+this.scope());
        },

        // As events propagate asynchronously we cannot simply throw
        // exceptions. Instead, ERN has this callback mailbox method.
        // Sort of an asynchronous complaint mailbox :)
        err: function (spec,message,sufferer) {
            console.error('error received: ',message,' by ',this.scope());
        },

        emit: function (spec,value,source) {
            //Spec.normalizeSig3(this,arguments);
            //var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            var ls=this._lstn;
            if (ls)
                for(var i=0; i<ls.length; i++) // TODO more fool-proof cycle protection
                    if (ls[i]!=source) // don't relay back to the source
                        ls[i].set(spec,value,this);
            if (this._reactions)
                for(var i=0; i<this._reactions.length; i++)
                    this._reactions[i].call(this,spec,value,source);
        },

        close: function () {
            // TODO normalize sig
            if (this._id!=='/')
                Swarm.root.obtain(this.spec().parent())._children[this._id] = undefined; // FIXME sucks
            if (this._lstn)
                for(var i=0; i<this._lstn.length; i++)
                    this._lstn[i].off(this);
        },
        
        gc: function viewGc () {
            if (!this._lstn || !this._lstn.length)
                this.close();
        }
    });
    

    //  S W A R M

    function Swarm (author) {
        if (Swarm.root)
            throw new Error('duplicate root object construction');
        Swarm.root = this;
        this.author = author;
        this.init('/');
    }

    EventRelay.extend(Swarm, {
        _childKey: 'type',
        //_defaultChild: Type,
        _types: {},
        init: function () {
            this._id = '/';
            this._lstn = [];
            this._children = {};
            for(var t in this._types)
                this._children[t] = new Type(t,this._types[t]);
        },
        scope: function () {
            return new Spec();
        },
        close: function () {
            EventRelay.prototype.close.call(this);
            Swarm.root = null;
            this._children = {};
        },
        set: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            if (!spec.version)
                spec.version = Spec.newVersion();
            return this.deliver('set',spec,value,lstn);
        },
        // THINK:
        //  * swarm is a sink for pipes, DELIVER
        //  * manages uplink/routing logic  TYPE DOES IT  Swarm.root.uplink(hash,reqs)
        //  * reentry point for local filtering   DELIVER
        //  isn't it a mess?!!   NO
        on: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            for(var id in this._children)
                peer.on(child.scope(),child.version(),child);
            // other peer subscribes
            // check time and everything
            //
            // walk the tree
            // send back a ton of on()
        },
        connect: function (lstn) {
            lstn.on('',this.version(),this);
            // walk the tree, find open objects
            // uplink.on() if uplink
            //
        }
    });


    //   T Y P E S

    // We define Type as another sort of syncable event relay in part
    // because we plan one day to synchronize model's logic/code the same
    // way we synchronize data (assign version numbers, exchange diffs on
    // open, etc)
    function Type (name,fun) {
        this._defaultChild = fun;
        this.init(name);
    }

    EventRelay.extend(Type, {
        _childKey: 'id',
        _specKey: 'type', // TODO automate (next table)
        scope: function () {
            var spec = new Spec();
            spec.type = this._defaultChild.id;
            return spec;
        }
    });

    Swarm.addType = function (constructor,name) {
        if (typeof(constructor.extend)!=='function')
            // Model by default (may be Set, View, Stub as well)
            Model.extend(constructor);
        name = name || constructor.id || constructor.name;
        constructor.id = name;
        Swarm.prototype._types[name] = constructor;
        if (Swarm.root) // late construction
            Swarm.root._children[name] = new Type(name,constructor,Swarm.root);
        constructor.obtain = function (id) { // TODO well well well
            return Swarm.root._children[name].obtain(id)
        };
    };
    //Swarm.prototype._defaultChild = Type;


    //   M O D E L S

    function Model (id) {
        this.init(id);
    }

    EventRelay.extend( Model, {
        _childKey: 'member',
        _specKey: 'id', // FIXME derive
        init: function () {
            Spec.freeze();
            EventRelay.prototype.init.apply(this,arguments);
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            var mmb = this._members;
            for (var cid in mmb)
                this._children[cid] = new mmb[cid].type(cid,mmb[cid].value,this);
            if (value) {
                if (typeof(value)!=='object')
                    throw new Error('init bundle must be an obj');
                this.set('',value,lstn);
            }
            Spec.thaw();
        },
        scope: function () {
            var ret = new Spec();
            ret.type = this.constructor.id;
            ret.id = this._id;
            return ret;
        },
        // we may react with a reciprocal subscription
        on: function() {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            if (spec.member)
                return this.deliver('on',spec,value,lstn); // TODO fast fix; replace
            this._lstn || (this._lstn=[]);
            this._lstn.push(lstn);  // TODO wrap fn
            if (value && lstn){ //} && typeof(lstn.set)==='function') {
                var diff = this.diff(value);
                if (diff)
                    lstn.set(this.spec(),diff,this);
            }
            if (lstn && typeof(lstn.on)==='function'){
                var respec= new Spec(spec);
                respec.member = 'reOn';
                lstn.on(respec,value,this);
            }
        },
        set: function () {
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            if (!spec.version) {
                // an introduced operation gets a version id...
                spec.version = Spec.newVersion();
                // ...then traverses the cascade from the root
                // to make sure local/remote event processing is identical
                return Swarm.root.deliver('set',spec,value,lstn);
            }
            if (!spec.member && typeof(value)==='object') {
                // TODO  diff: {.field!vid:value}
                var fieldSpec = new Spec(spec);
                for(var key in value) {
                    fieldSpec.member = key;
                    this.deliver('set',fieldSpec,value[key],lstn);
                }
            } else
                throw new Error("signature not understood: "+spec+' '+value);
        },
        diff: function (base) {
        },
        toJSON: function () {
        },
        pojo: function () {
            var ret = {}, chi=this._children;
            for(var name in chi) 
                if (chi[name].value)
                    ret[name] = chi[name].value;
            return ret;
        }
    });

    Swarm.prototype.addModel = function (constructor,name) {
        Model.extend(constructor);
        name = name || constructor.name;
        return this.create(name,constructor);
    };

    Model.addMethod = function () {
    };

    Model.addCall = function () {
    };


    //  M O D E L  F I E L D S
    
    function Field (id,value) { // TODO new subtypes; _id in the proto
        this.init(id,value);
    }

    EventRelay.extend(Field, {
        _specKey: 'member', // FIXME
        _children: null,
        scope:function () {
            return null;  // TODO  .parent ?
        },
        init: function (id, value) {
            //this._id = id; // _id is in the prototype already
            this._lstn = null;
            if (value) {
                this.value = value;
                this.version = Spec.newVersion();
            } else {
                this.value = this.constructor.defaultValue;
                this.version = '';
            }
        },
        set: function () {
            // no direct invocation thus no Spec.normalizeSig3
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            this.value = value;
            this.version = spec.version;
        },
        get: function () {
            return this.value;
        }
    });


    Model.addProperty = function (name, value, type) {
        if (typeof(this)!=='function' || typeof(this.prototype.on)!=='function')
            throw new Error('you are doing it wrong');
        var proto = this.prototype;
        proto[name] = function (val) {
            if (val)
                return this.set(name,val);
            else
                return this._children[name].value;
        };
        proto._members || (proto._members={});
        proto._members[name] = {
            type: type || Field,
            value: value || null
        };
    };

    // A *reaction* is a hybrid of a listener and a method. It "reacts" on a
    // certain event for all objects of that type. The callback gets invoked
    // as a method, i.e. this===emitter. In an event-oriented architecture
    // reactions are rather handy, e.g. for creating mixins.
    Model.addReaction = function (name, callback) {
        // FIXME wrong!
        var defCh = this.prototype._members[name];
        var ptype = defCh.type.prototype;
        ptype._reactions || (ptype._reactions = []);
        ptype._reactions.push(callback);
        return callback;
    };

    Model.removeReaction = function (name, callback) {
        var defCh = this.prototype._members[name];
        var ptype = defCh.type.prototype;
        var i = ptype._reactions.indexOf(callback);
        i!==-1 && ptype._reactions.splice(i,1);
    };
    
    
    //  M O D E L'S  L O G G E D  M E T H O D S

    function LoggedMethod (id,fn,parent) { this.init(id,fn,parent); }

    EventRelay.extend(LoggedMethod, {
        _specKey: 'member', // FIXME
        _children: null,
        scope:function () { return null; },
        init: function (id, func, parent) {
            this._lstn = null;
            this.func = func;
            this.parent = parent;
        },
        set: function () {
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            this.func.apply(this.parent,value);
        }
    });
    

    Model.addLoggedMethod = function (name, func) {
        if (typeof(name)==='function') {
            func = name;
            name = func.name;
        }
        var proto = this.prototype;
        proto[name] = function () {
            this.set(name,arguments,this);
        }
        proto._members || (proto._members={});
        proto._members[name] = {
            type: LoggedMethod,
            value: func
        };
    };
    
    Model.addEvent = function addEvent(name) {
        this.addLoggedMethod(name,function empty(){})
    };


    //  S E T S

    // A field storing a reference to another model or set.
    function Reference (id,val) {
        this.init(id,val);
    }

    Field.extend(Reference, {
        init: Field.prototype.init,
        set: Field.prototype.set,
        target: function () {
            var spec = new Spec();
            spec.type = this._valueType.id;
            spec.id = this.value;
            return Swarm.root.obtain(spec);
        }
    });

    // Backbone has Collections which are (essentially) arrays.
    // Unfortunately, concurrent modification of arrays sorta
    // messes indexes up. Thus, we use key-value sets as our
    // primary abstraction of a "collection".
    function Set (id) {
        this.init(id);
    }

    EventRelay.extend(Set, {
        _childKey: 'member',
        _specKey: 'id',
        _defaultChild: Reference,
        scope: Model.prototype.scope,
        init: Model.prototype.init,
        get: function () { 
            Spec.normalizeSig3(this,arguments);
            var spec=arguments[0], value=arguments[1], lstn=arguments[2];
            var child = this._children[spec.member];
            if (child)
                return child.target();
            else
                return undefined;
        },
        set: Model.prototype.set
    });

    Set.setReferenceType = function (fun) {
        var et = function ReferenceType (id, val) { this.init(id,val) };
        Reference.extend(et);
        et.prototype._valueType = fun;
        this.prototype._defaultChild = et;
    };


    //   V I E W
    //
    //   Swarm views are pretty standard but with a minor twist. The core
    //   of th process is, obviously, some template, that is fed with a
    //   model's data. A view is considered a "replica" ie it may consume
    //   and emit data change events. Also, a view listens to the model,
    //   thus preventing its gc. Views are used on the client and server
    //   side alike so there are no pointers to the DOM inside. Instead, a
    //   DOM/HTML ViewBuilder collects HTML from views and assembles it to
    //   the actual presentation.
    
    function View (id) {
        this.html = '';
        this.init(id);
    }

    // Wraps a piece of HTML
    EventRelay.extend(View, {
        scope: function () {
            var ret = new Spec();
            ret.type = this.constructor.id;
            ret.id = this._id;
            return ret; // TODO  Type+View Type+XXXView
        },
        init : function viewInit(id) {
            this._id = Spec.is(id) ? Spec.as(id).id : id;
            this._lstn = null;
            this._entries = null;
            var registry = Swarm.root._children[this.constructor.id]._children; // TODO dirty
            if (this._id in registry)
                throw new Error('duplicate view TODO');
            registry[this._id] = this;
            
            if (typeof(this.constructor.prototype.modelType)==='function') // FIXME EEE
                this.constructor.prototype.modelType = this.constructor.prototype.modelType.id;
            if (this.template && !this.tmplFn) // FIXME prototype static init()
                this.tmplFn = Swarm.uTemplate(this.template);
            
            var origin = new Spec();
            origin.id = this._id;
            origin.type = this.modelType;
            this.model = Swarm.root.obtain(origin);
            // subscribe to updates from the model
            this.model.on(origin,undefined,this);
            this._html = this.render(); // TODO on(spec,'') => set() back
            this.parseNestedViews();
        },
        // Here we know that something has changed
        set: function (spec,val,lstn) {
            if (spec.id==this._id) { // render new HTML
                this._html = this.render();
                this.parseNestedViews();
            } else {
                // something happened in a nested view; we don't care much
            }
            // NOTE: may emit nested view's spec
            if (this._lstn || this._reactions)
                this.emit(spec,this._html,lstn);
        },
        parseNestedViews: function () {
            var m = [], nested = [], specs = {};
            while ( m = View.reNestedEnvelope.exec(this._html) ) {
                if (!Spec.is(m[3]||m[4])) continue;
                var spec = new Spec(m[3]||m[4]), tagName = m[2], chunk = m[1];
                if (!spec.type)
                    throw new Error('type>view mapping is not implemented yet');
                if (!spec.member)
                    throw new Error('what?');
                if (!spec.id) {
                    var field = this.model.child(spec.member);
                    if (typeof(field.target)==='function') {
                        spec.id = field.value; // TODO spec
                        spec.member = null;
                    } else
                        spec.id = this._id;
                }
                // NEED static _init then (addType,compile templates,set model-view mapping, tagName)
                nested.push({spec:spec, from:m.index, till:m.index+chunk.length});
            }
            // subscribe/unsubscribe to nested views
            if (this._nestedViews || nested.length) {
                for(var i=0; i<nested.length; i++)
                    specs[nested[i].spec] = true;
                for(var spec in this._nestedViews) {
                    if (spec in specs) { // no changes
                        delete specs[spec];
                    } else { // nested view was removed
                        this._nestedViews[spec].reOff(this);
                        delete this._nestedViews[spec];
                    }
                }
                for(var spec in specs) { // new nested views
                    this._nestedViews || (this._nestedViews={}); // FIXME
                    var view = Swarm.root.obtain(spec);
                    view.reOn(this);
                    this._nestedViews[spec] = view;
                }
            }
            this._inserts = nested.length ? nested : null; // FIXME simplify
        },
        // Returns the 'inner' HTML of the view (no envelope, empty envelopes for nested views)
        render: function viewRender() {
            return this.tmplFn.apply(this);
        },
        envelope: function (html) {
            return '<'+(this.tagName||'div')+' id="'+this.scope()+/*'" version="'
            +this.model.version()+*/'">' + html + '</'+(this.tagName||'div')+'>';
            // TODO BIG TODO  isEmpty === NO VERSION!!!!
        },
        // Returns HTML for the view including the envelope and nested views, if any 
        html: function () {
            var html = this._html;
            if (this._inserts) {
                var htmlTree = [], prev = 0;
                for (var i=0, prev=0; i<this._inserts.length; i++) {
                    var ins = this._inserts[i], 
                        pre = this._html.substring(prev,ins.from),
                        stub = this._html.substring(ins.from,ins.till);
                    prev = ins.till;
                    htmlTree.push(pre);
                    var nested = this._nestedViews[ins.spec];
                    htmlTree.push(nested?nested.html():stub); // TODO isEmpty, '~complete' event
                }
                htmlTree.push(this._html.substring(prev));
                html = htmlTree.join('');
            }
            return this.envelope(html);
        },
        gc: function () {
            // find element
            // no element -> close
        }
    });
    
    /** Recognizes nested views   always an empty tag like <div id='/MyNestedTypeView#nestedId'/> */
    View.reNestedEnvelope = /(<(\w+)\s+id\s*=\s*(?:'(\S+)'|"(\S+)")\s*\/>)/gi;
    
    
    // ultra simple templates based on A.Evstigneev variant of J.Resig microtemplates
    Swarm.uTemplate = (function(){

        var SPACE_RE = /[\r\t\n]/g,
            QUOTE_RE = /'/g,
            ESC_QUOTE_RE = /\\'/g,
            proc = function(all, sign, g1){ // FIXME escaping
                var s = g1.replace(ESC_QUOTE_RE, "'");
                switch (sign) {
                // property
                case '.': return "'+ _m."+s+"() +'";
                // nested view
                case '/': return "'+'<div id=\"/" + s + "\"/>' +'";
                // expression
                case '=': return "'+" + s + "+'";           // TODO escaped <>&'""
                // unescaped expression
                case '!': ;
                // any code
                default:  return "';" + s + "; _s+='";
                }
            };

        function tmpl(str){
            // FIXME  NEED TO SANITIZE ANY USER DATA FOR <>&"'
            var fnbody = "var _m=this.model; var _s='" + 
            str.replace(SPACE_RE, " ").replace(QUOTE_RE, "\\'").replace(tmpl.procRe, proc) + 
            "';return _s;";
            return new Function("data", fnbody);
        }

        tmpl.procRe = /<%([=\.!\/])?(.+?)%>/g;

        return tmpl;
    }());
    
    
    View.refreshDomReaction = function (spec,html,view) {
        // find element
        //     no element => gc
        // set: save subviews, install html; replace stubs
    };
    
    
    View.revitalize = function revitalizeDomTree (rootEl) {
        // TODO gc: add listener???!!!!
        View.addReaction('html',View.refreshDomReaction);
        var nodes = rootEl.querySelectorAll('[id]');
        for(var i=0; i<nodes.length; i++) {
            var node = nodes.item(i);
            var id = node.getAttribute('id');
            if (!Spec.is(id)) continue;
            var view = Swarm.root.obtain(id);
        }
    };
    

    var TabularView = function (id,htmlTemplate) {
        // model.on
        id = Spec.as(id);
        if (!id.type || !id.id) throw 'need a /full#id';
        this._id;
        this.template = _.template(htmlTemplate);
        this.html = '';
        Swarm.on(id,this);
    }

    View.extend( TabularView, {
        apply: function (spec,val,model) {
            var html = ['<table>\n<th>',spec.toString(),'</th>'];
            var props = model.pojo();
            for(var name in props) 
                html.push('\n<tr><td>',name,'</td><td>',props[name],'</td></tr>');
            html.push('\n</table>');
            return html.join('');
        }
    });

    var _View = function (id,template) {
        this.init(id);
    };

    EventRelay.extend( _View, {
        set: TabularView.prototype.set,
        apply: function (spec,val,model) {
            this.html = this.template(model.pojo());
        }
    });


    //  V I E W  B U I L D E R

    function HTMLViewBuilder(id) {
        this.init(id);
        this.rootView = Swarm.root.obtain(id);
        if (this.rootView.html)
            this.set(id,undefined,this.rootView);
        this.rootView.on(this);
    }

    HTMLViewBuilder.reChildEnvelope = /(<(\w+)\s+(?:id)\s*=\s*('\S+'|"\S+")\s*>)\s*(<\/\2>)/i;

    EventRelay.extend(HTMLViewBuilder, {
        init: function (id) {
            this._id = id;
            this._lstn = [];
        },
        set: function(spec,val,lstn) {
            var html = lstn.render();
            this.vitalize(html);
        },
        vitalize: function (id,html) {
            var parsed = {html:html, child:[], pos:[]}, m=[];
            // scan html find ids
            while (m=HTMLViewBuilder.reChildEnvelope.exec(html)) {
                var offset = m.index, openTag = m[1], tag = m[2], id = m[3], closeTag = m[4];
                // TODO unquote,syntax
                
                parsed.child.push(id);
                parsed.pos.push(offset+openTag.length);
                if (true) { //???
                    this.waitList.push(id);
                    var view = Swarm.root.obtain(id);
                    //if (view.html)
                    //    this.set(,,view);
                    view.on(id,'',this); // empty base ~ get back a diff
                }
            }
        },
        getViewTree: function (id,html) {
            html = html||[];
            var parsed = this.parsedViews[id];
            for(;;) {
                html.push(parsed.html.substring(prevPos,parsed.pos[i]));
                this.getViewTree(parsed.child[i],html);
                prevPos = parsed.pos[i];
            }
            return html;
        },
        toString: function () {
            var html = this.getViewTree(this.id);
            return html.join('');
        },
        gc: function () {
            var views = {};
            function listViews() {
                views[i] = true;
                listViews(i);
            }
            for (var id in this.parsedViews)
                if (!(id in views)) {
                    Swarm.root.obtain(id).off(this);
                    delete this.parsedViews[id];
                }
        }
    });

    function DOMViewBuilder (id,root) {
        if (typeof(id)==='object' && id.nodeName) {
            root = id;
            id = root.getAttribute('id');
        }
        this.init(id,root);
    }

    EventRelay.extend(DOMViewBuilder, {
        init: function (id,root) {
            this._id = id;
            this._lstn = undefined;
            this.views = {};
            this.rootEl = root;
            root.setAttribute('id',id);
            this.vitalize(root);
        },
        findLiveNodes: function (root,id) {
            root = root||this.rootEl;
            var selector = id ? '[id="%"]'.replace('%',id) : '[id]';
            var nodes = root.querySelectorAll(selector);
            var ret = Spec.is(root.id) ? [root] : [];
            for(var i=0; i<nodes.length; i++) {
                var node = nodes.item(i);
                Spec.is(node.id) && ret.push(node);
            }
            return ret;
        },
        set: function(spec,val,view) {
            var nodes = this.findLiveNodes(this.rootEl,spec), envelope;
            if (nodes.length===0)
                return view.off(this);
            while (envelope=nodes.pop()) {
                var domvid = envelope.getAttribute('version');
                var vid = view.getVersion();
                if (domvid===vid) // no changes actually
                    continue;
                // save DOM trees of our subviews we don't want to rebuild
                var cachedEnvs = this.findLiveNodes(envelope);
                envelope.innerHTML = view.html; // install new HTML
                envelope.setAttribute('version',vid); // remember version
                this.vitalize(envelope,cachedEnvs); // reinsert subviews
            }
        },
        reOn: function (spec,nothing,view) {
            this.views[spec] = view;
        },
        reOff: function (spec,nothing,view) {
            delete this.views[spec];
            // TODO drop/shade DOM nodes if found?
        },
        vitalize: function (el,cachedEnvs) {
            var nodes = this.findLiveNodes(), node;
            while (node=nodes.pop()) {
                var id = node.id;
                // TODO default View substitution
                if (cachedEnvs && (id in cachedEnvs)) { // recover a child
                    node.id = '';
                    node.parentNode.insertBefore(cachedEnvs[id],node);
                    node.parentNode.removeChild(node);
                } else if (id in this.views) { // it wasn't there
                    var html = view.html;
                    node.innerHTML = html;
                    this.vitalize(node);
                } else { // we didn't listen to such a view
                    var view = Swarm.root.obtain(id);
                    this.views[id] = view;
                    view.on(id,'',this);
                }
            }
        },
        gc: function () {
            var presentViews = {};
            var node, nodes = this.findLiveNodes();
            while (node=nodes.pop())
                presentViews[node.id] = true;
            for (var spec in this.views)
                if (!(spec in presentViews))
                    views[spec].off(this);
        }
    });


    //  T R A N S P O R T

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

// TODO
//Model.EMPTY = 0;
//Model.READY = 1;
// bundled sigs: same vid only!!! {key:val},{vid:vid} or key,val.{vid:vid} then

    return {
        Swarm: Swarm,
        Spec:  Spec,
        Model: Model,
        Set: Set,
        Reference: Reference,
        Field: Field,
        View: View,
        TabularView: TabularView,
        DOMViewBuilder: DOMViewBuilder,
        HTMLViewBuilder: HTMLViewBuilder
    };

}());

if (typeof window === 'object') {
    for(key in exports)
        window[key] = exports[key];
} else {
    module.exports = exports;
}
