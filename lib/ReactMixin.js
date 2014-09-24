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
            if (this.constructor.modelType) {
                var id = spec;
                spec = new Spec(this.constructor.modelType,'/'); // TODO fn!!!
                spec = spec.add(id,'#');
            } else {
                throw new Error('not a specifier: '+spec);
            }
        }
        this.sync = env.localhost.get(spec);
        this.setState({version:''});
        this.sync.on('.state', this); // TODO single listener
        this.sync.on(this);
        /*if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.onObjectEvent(this);
        }*/
    },

    componentWillUnmount: function () {
        this.sync.off(this);
        /*if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.offObjectEvent(this);
        }*/
    },

    shouldComponentUpdate: function (nextProps, nextState) {
        console.log('Should?', this.sync._id);
        return this.props!==nextProps || this.state.version!==nextState.version;
    }

};
