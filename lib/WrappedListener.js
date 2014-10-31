"use strict";

/**
 * Used as a Syncable listeners list entry
 *
 * @param {Syncable} owner
 * @param {function|{deliver:function}|WrappedListener|Syncable} listener
 * @param {string} filter filter string
 * @param {function(Spec, string, *)} filterFn
 * @constructor
 */
function WrappedListener(owner, listener, filter, filterFn) {
    filterFn || (filterFn = anyOperation);
    filter || (filter = '*');
    if (!listener) {
        throw new Error('Empty listener');
    }

    this.owner = owner;
    this.filterFn = filterFn;
    if (listener.constructor === WrappedListener) {
        this.chained = listener;
        this.owner = listener.owner;
        this.sink = listener.sink;
        this.listener = listener.listener;
        this.fullFilter = filter + '+' + listener.filter;
    } else {
        if (listener.constructor === Function) {
            this.owner = owner;
            this.sink = null;
            this.listener = listener;
        } else if (listener.deliver) {
            this.owner = listener;
            this.sink = listener;
            this.listener = listener.deliver;
        } else {
            throw new Error('listener must be a Function or should have "deliver" method');
        }
        this.fullFilter = filter;
    }
}

/**
 * Checks weather obj can receive operations (is a function or has "deliver"-method)
 * @param {*} obj
 * @returns {boolean}
 */
WrappedListener.isOpSink = function (obj) {
    if (!obj) { return false; }
    if (obj.constructor === Function) { return true; }
    if (obj.deliver && obj.deliver.constructor === Function) { return true; }
    return false;
};


function anyOperation() {
    return true;
}

/**
 *
 * @param {Spec} spec
 * @param {*} val
 * @param {{deliver:function}} src
 * @protected
 */
WrappedListener.prototype.notify = function (spec, val, src) {
    if (this.sink) {
        this.sink.deliver(spec, val, src);
    } else {
        this.listener.call(this.owner, spec, val, src);
    }
};

/**
 *
 * @param {Spec} spec
 * @param {*} val
 * @param {{deliver:function}} src
 * @public
 */
WrappedListener.prototype.deliver = function (spec, val, src) {
    if (this.filterFn.call(this.owner, spec, val, src)) {
        if (this.chained) {
            this.chained.deliver(spec, val, src);
        } else {
            this.notify(spec, val, src);
        }
    }
};

/**
 * same filter + listener
 * @param {WrappedListener} other
 * @returns {boolean}
 */
WrappedListener.prototype.equals = function (other) {
    return other &&
        other.constructor === WrappedListener &&
        this.fullFilter === other.fullFilter &&
        this.sink === other.sink &&
        this.listener === other.listener;
};

/**
 * Checks weather this listener listener is the same as specified
 * @param {function|{deliver:function}} listener listener
 * @returns {boolean}
 */
WrappedListener.prototype.sameListener = function (listener) {
    return this.sink === listener || this.listener === listener;
};

WrappedListener.prototype.toString = function () {
    var listenerName = this.sink && this.sink.toString() || this.listener.name;
    return '[' + this.filterFn.name + ' ' + this.fullFilter + ' ' + listenerName + ']';
};

module.exports = WrappedListener;