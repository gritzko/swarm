var app = app || {};

(function () {
    'use strict';

    var SwarmMixin = {
        deliver: function (spec,val,source) {
            this.forceUpdate();
        },
        componentWillMount: function () {
            var spec = this.props.spec;
            this.sync = app.host.get(spec);
            this.sync.on(this);
        },
        componentWillUnmount: function () {
            this.sync.off(this);
        }
    };

    var MouseView = React.createClass({

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

    var MiceView = React.createClass({

        mixins: [SwarmMixin],

        getInitialState: function () {
            return {};
        },

        render: function () {

            var mice = app.host.get(this.props.spec);   // FIXME automatically
            var crowd = mice.list();
            var crowdView = crowd.map(
                function (mouse) {
                    return MouseView({spec:mouse.stateSpec()});
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

    var MouseTrackApp = React.createClass({

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
       
    
    React.renderComponent(
            MouseTrackApp ({spec:app.mice.stateSpec()}),
            document.getElementById('mice')
    );

})();

// create Host
// create a Mouse object
// open #mice, list our object
// create mice-view
// create WebSocket connection
// create Pipe
