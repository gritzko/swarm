"use strict";

var env = require('./env');
var Spec = require('./Spec');

module.exports = {

    deliver: function (spec,val,source) {
        var sync = this.sync;
        var state = {
            version: sync._version,
            itemsMaxVersion: ''
        };
        if (this.props.listenEntries) {
            state.itemsMaxVersion = sync.objects.reduce(function (maxVer, item) {
                if (item._version && item._version > maxVer) {
                    return item._version;
                } else {
                    return maxVer;
                }
            }, '');
        }
        this.setState(state);
    },

    componentWillMount: function () {
        var spec = this.props.spec || this.props.key;
        if (!Spec.is(spec)) {
            if (spec && this.constructor.modelType) {
                var id = spec;
                spec = new Spec(this.constructor.modelType,'/'); // TODO fn!!!
                spec = spec.add(id,'#');
            } else {
                throw new Error('not a specifier: '+spec+' at '+this._rootNodeID);
            }
        }
        this.sync = env.localhost.get(spec);
        this.setState({version:'', itemsMaxVersion:''});
        if (!env.isServer) {
            var sync = this.sync;
            sync.on('.init', this); // TODO single listener
            sync.on(this);
            if (this.props.listenEntries) {
                sync.onObjectEvent(this);
            }
        }
    },

    componentWillUnmount: function () {
        if (!env.isServer) {
            var sync = this.sync;
            sync.off(this);
            if (this.props.listenEntries) {
                sync.offObjectEvent(this);
            }
        }
    },

    shouldComponentUpdate: function (nextProps, nextState) {
        return this.props !== nextProps ||
                this.state.version !== nextState.version ||
                this.state.itemsMaxVersion !== nextState.itemsMaxVersion;
    }

};
