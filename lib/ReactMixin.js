"use strict";

var env = require('./env');
var Spec = require('./Spec');

module.exports = {

    deliver: function (spec,val,source) {
        var sync = this.sync;
        var version = sync._version;
        if (this.props.listenEntries) {
            var opId = '!' + spec.version();
            if (version !== opId) {
                version = opId;
            }
        }
        this.setState({version: version});
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
        this.setState({version:''});
        if (!env.isServer) {
            var sync = this.sync;
            sync.on('init', this); // TODO single listener
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
            sync.off(this); // FIXME: remove after TODO: prevent second subscription
            if (this.props.listenEntries) {
                sync.offObjectEvent(this);
            }
        }
    },

    shouldComponentUpdate: function (nextProps, nextState) {
        return this.props !== nextProps || this.state.version !== nextState.version;
    }

};
