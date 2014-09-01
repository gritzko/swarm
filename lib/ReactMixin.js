"use strict";

var env = require('./env');

module.exports = {

    deliver: function (spec,val,source) {
        if (this.isMounted()) { 
            this.forceUpdate();
        }
    },

    componentWillMount: function () {
        var spec = this.props.spec || this.props.key;
        if (!Spec.is(spec)) { 
            throw new Error('not a specifier: '+spec); 
        }
        this.sync = env.localhost.get(spec);
        this.sync.on('.init', this); // TODO single listener
        this.sync.on(this);
    },

    componentWillUnmount: function () {
        this.sync.off(this);
    }/*,

    propTypes: {
        spec: ReactPropTypes.string.isRequired
    }*/

};
