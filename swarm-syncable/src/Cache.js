"use strict";
const swarm = require('swarm-protocol');
const Op = swarm.Op;
const OpStream = require('./OpStream');
const URL = require('./URL');

/** Enables client reconnections and caching.
 *  Client emits !0 subscriptions. */
class Cache extends OpStream {

    /**
     *  @param {OpStream} client - the client replica
     **/
    constructor (url, options) {
        super();
        this.origin = null;
        this.url = new URL(url);
        this.upstream = OpStream.connect(this.url.nested());
        this.upstream.on(this);
        this.log = [];
        this.dirty = Object.create(null);
        this.__ = Object.create(null);
        this.__log = [];
        this._timer = null; // FIXME ensure flushes don't overlap
    }

    /** this method to be overridden with some key-value storage access */
    _cache_flush ( callback ) {
        // Object.keys(this.dirty).forEach( object => { FIXME back .on
        //     const state = this.client.get(object);
        //     this.__.log[object] = state.toOp();
        // } );
        this.__log = this.log;
        callback && callback();
    }

    /** this method to be overridden with some key-value storage access */
    _cache_read ( key, callback ) {
        const cached = this.__[key];
        if (cached)
            callback(Op.parseFrame(cached+'\n')[0]);
        else
            callback(null);
    }

    _cache_log_read (callback) {

    }

    _resubscribe (opstream) {
        // convention: meta object is the first?!!!
        this.client.activeObjects().forEach( obj => {
            this._emit(obj.toOn());
        } );
    }

    markObjectDirty (op) {
        this.dirty[op.object] = 1;
        if (this._timer===null) //!!!!
            this._timer = setTimeout( this._cache_flush.bind(this), 1000 );
    }

    logOp (op) {
        if (this._timer===undefined)
            return;
        if (this._timer!==null) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }

        this._logged.push(op);

        setTimeout(()=>{ // batching guarantees
            this._timer = null;
            const logged = this._logged;
            this._logged = [];
            this._cache_flush(() => {
                this._emitAll(logged);
            });
        }, 0);
    }

    _apply (op) {
        switch (op.method) {

        case Op.METHOD_STATE:
            this.markObjectDirty(op);
            this._emit(op);
            break;

        case Op.METHOD_ON:
        case Op.METHOD_OFF:
            this._emit(op);
            break;

        case Op.METHOD_ERROR:
            this._emit(op);
            break;

        default:
            if (op.origin===this.origin) {
                while (this.log.length && this.log[0].stamp<=op.stamp)
                    this.log.shift();
            }
            this.markObjectDirty(op);
            this._emit(op);
            break;

        }
    }

    offer (op) {
        switch (op.method) {

            case Op.METHOD_STATE:
                this.markDirty(op.object);
                this.upstream.offer(op);
                break;

            case Op.METHOD_ON:
            case Op.METHOD_OFF:
                this._cache_read(op.object, state => {
                    if (state) {
                        this._emit(state);
                        op = op.restamped(state.stamp);
                    }
                    this.upstream.offer(op);
                });
                break;

            case Op.METHOD_ERROR:
                this.upstream.offer(op);
                break;

            default:
                this.log.push(op);
                this._cache_flush(()=>this.upstream.offer(op));
                break;

        }
    }

}

OpStream._URL_HANDLERS['mem'] = Cache;

module.exports = Cache;