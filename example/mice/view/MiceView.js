var SwarmMixin = require('../../../lib/ReactMixin');
var MouseView = require('./MouseView');

module.exports = React.createClass({
    displayName: 'MiceView',

    mixins: [SwarmMixin],

    getInitialState: function () {
        return {};
    },

    render: function () {

        var mice = this.sync;
        var crowd = mice.list();
        var crowdView = crowd.map(
            function (mouse) {
                return MouseView({key: mouse.spec(), spec: mouse.stateSpec()});
            }
        );

        return (
            React.DOM.div(
                {id:mice._id},
                crowdView
            )
        );

    }

});
