"use strict";


module.exports = {

    /**
     * Subscribe on collections entries' events
     * @param {function(Spec|string, Object, {deliver: function()})} callback
     * @this Set|Vector
     */
    onObjectEvent: function (callback) {
        this._proxy.owner = this;
        this._proxy.on(callback);
    },

    /**
     * Unsubscribe from collections entries' events
     * @param {function(*)} callback
     * @this Set|Vector
     */
    offObjectEvent: function (callback) {
        this._proxy.off(callback);
    },

    /**
     * Waits for collection to receive state from cache or uplink and then invokes passed callback
     *
     * @param {function()} callback
     * @this Set|Vector
     */
    onObjectStateReady: function (callback) { // TODO timeout ?
        var self = this;
        function checker() {
            var notInitedYet = self.filter(function (entry) {
                return !entry._version;
            });
            if (!notInitedYet.length) {
                // all entries are inited
                callback();
            } else {
                // wait for some entry not ready yet
                var randomIdx = (Math.random() * (notInitedYet.length - 1)) | 0;
                notInitedYet[randomIdx].once('init', checker);
            }
        }
        if (this._version) {
            checker();
        } else {
            this.once('init', checker);
        }
    }
};