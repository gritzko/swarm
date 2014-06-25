if (typeof require === 'function') {
    Swarm = require('../../lib/swarm3.js');
    React;
}

var app = app || {};

var SwarmMixin = {
    deliver: function (spec,val,source) {
        this.forceUpdate();
    },
    componentWillMount: function () {
        var spec = this.props.spec;
        this.sync = Swarm.localhost.get(spec);
        this.sync.on('.init',this);
        this.sync.on(this);
    },
    componentWillUnmount: function () {
        this.sync.off(this);
    }
};

var AgendaView = React.createClass({

    mixins: [SwarmMixin],

    render: function () {
        var agenda = this.sync;
        
        var titles = [ '', 'Consistency', 'Availability', 'Partition tolerance' ];
        var cols = titles.map(function(t){return React.DOM.th({},t)});
        var header = React.DOM.tr({},cols);
        
        var rows = Agenda.SLOTS.map(function(slot){
            var cells = Agenda.TRACKS.map(function(track){
                var text = [];
                text.push(React.DOM.span({className:'title'},
                    Agenda.PROGRAM[track][slot].title));
                text.push(React.DOM.span({className:'speakers'},
                    ' '+Agenda.PROGRAM[track][slot].speakers));
                var toAttend = agenda.agenda[slot];
                var clazz = 'talk';
                if (toAttend)
                    clazz += toAttend===track ? ' attend' : ' skip';
                return React.DOM.td(
                    {
                        id: slot+'_'+track,
                        className: clazz
                    },
                    text);
            });
            cells.unshift(React.DOM.td({className:'time'},slot));
            return React.DOM.tr({
                },
                cells
            );
        });
        
        rows.unshift(header);
        
        return React.DOM.table({},rows);
    }

});

var user;
var usersAgendaSpec;

React.renderComponent(
        AgendaView({spec:app.agendaSpec}),
        document.getElementById('agenda')
        );
