"use strict";

var env = require('./env');
var Spec = require('./Spec');

module.exports = {

    deliver: function (spec,val,source) {
        this.setState({version:this.sync._version});
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
                console.error(this.render);
            }
        }
        this.sync = env.localhost.get(spec);
        this.setState({version:''});
        if (!env.isServer) {
            this.sync.on('.init', this); // TODO single listener
            this.sync.on(this);
        }
        /*if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.onObjectEvent(this);
        }*/
    },

    componentWillUnmount: function () {
        if (!env.isServer) {
            this.sync.off(this);
        }
        /*if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.offObjectEvent(this);
        }*/
    },

    shouldComponentUpdate: function (nextProps, nextState) {
        return this.props!==nextProps || this.state.version!==nextState.version;
    }

};
