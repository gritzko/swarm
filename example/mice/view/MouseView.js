var SwarmMixin = require('../../../lib/ReactMixin');

module.exports = React.createClass({
    displayName: 'MouseView',

    mixins: [SwarmMixin],

    render: function () {
        var spec = this.props.spec;
        var mouse = this.sync; //app.host.get(spec);

        return React.DOM.span({
            id: mouse._id,
            className: "mouse",
            style: {
                top: mouse.y,
                left: mouse.x
            },
        }, mouse.symbol);
    }
});
