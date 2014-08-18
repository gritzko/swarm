var env = require('./env');

module.exports = {
    deliver: function (spec,val,source) {
        if (!this.isMounted()) return;
        this.forceUpdate();
    },
    componentWillMount: function () {
        var spec = this.props.spec;
        this.sync = env.localhost.get(spec);
        this.sync.on('.init',this); // TODO single listener
        this.sync.on(this);
    },
    componentWillUnmount: function () {
        this.sync.off(this);
    }
};
