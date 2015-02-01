"use strict";

/**
 * Used as a Syncable listeners list entry
 *
 * @param {{ctx:Syncable, listener:function|{deliver:function}|WrappedListener|Syncable, filter:String, filterFn:function}} opts
 * @constructor
 */
function WrappedListener(opts) {
    var ln = this;
    if (!opts) {
        throw new Error('empty listener options');
    }
    var ctx = opts.ctx;
    var listener = opts.listener;
    var filter = opts.filter || '*';
    var filterFn = opts.filterFn || anyOperation;
    var notify = opts.notify || defaultNotify;

    if (!listener) {
        throw new Error('Empty listener');
    }

    var chained;
    var sink;

    Object.defineProperties(ln, {
        ctx: {get: function () { return ctx; }},
        filter: {get: function () { return filter; }},
        sink: {get: function () { return sink; }},
        listener: {get: function () { return listener; }}
    });

    ln.deliver = deliver;
    ln.notify = notify;
    ln.defaultNotify = defaultNotify;
    ln.sameListener = sameListener;
    ln.equals = equals;
    ln.toString = toString;

    if (listener.constructor === WrappedListener) {
        chained = listener;
        ctx = listener.ctx;
        sink = listener.sink;
        filter = listener.filter;
        listener = listener.listener;
    } else {
        if (listener.constructor === Function) {
            sink = null;
        } else if (listener.deliver) {
            ctx = listener;
            sink = listener;
            listener = listener.deliver;
        } else {
            throw new Error('listener must be a Function or should have "deliver" method');
        }
    }


    function anyOperation() {
        return true;
    }

    /**
     * @param {Spec} spec
     * @param {*} val
     * @param {{deliver:function}} src
     * @protected
     */
    function defaultNotify(spec, val, src) {
        if (sink) {
            sink.deliver(spec, val, src);
        } else {
            listener.call(ctx, spec, val, src);
        }
    }

    /**
     * @param {Spec} spec
     * @param {*} val
     * @param {{deliver:function}} src
     * @public
     */
    function deliver(spec, val, src) {
        if (filterFn.call(ctx, spec, val, src)) {
            if (chained) {
                chained.deliver(spec, val, src);
            } else {
                notify(spec, val, src);
            }
        }
    }

    /**
     * same filter + listener
     * @param {WrappedListener} other
     * @returns {boolean}
     */
    function equals(other) {
        return other &&
                other.constructor === WrappedListener &&
                filter === other.filter &&
                sink === other.sink &&
                listener === other.listener;
    }

    /**
     * Checks weather this listener listener is the same as specified
     * @param {function|{deliver:function}} ln listener
     * @returns {boolean}
     */
    function sameListener(ln) {
        return sink === ln || listener === ln;
    }

    function toString() {
        var listenerName = sink && sink.toString() || listener.name;
        return '[' + filterFn.name + ' ' + filter + ' ' + listenerName + ']';
    }
}

/**
 * Checks weather obj can receive operations (is a function or has "deliver"-method)
 * @param {*} obj
 * @returns {boolean}
 */
WrappedListener.isOpSink = function isOpSink(obj) {
    if (!obj) { return false; }
    if (obj.constructor === Function) { return true; }
    if (obj.deliver && obj.deliver.constructor === Function) { return true; }
    return false;
};


module.exports = WrappedListener;