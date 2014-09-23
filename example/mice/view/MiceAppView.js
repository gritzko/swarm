"use strict";

var React = require('react');
var MiceView = require('./MiceView');

module.exports = React.createClass({
    displayName: 'MiceApp',

    getInitialState: function () {
        return {};
    },

    componentDidMount: function () {
        // TODO add router here
    },

    render: function () {
        return (
            React.DOM.div(
                {id:"app"},
                MiceView({spec:this.props.spec})
            )
        );
    }

});
