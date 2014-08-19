var SwarmMixin = require('../../../lib/ReactMixin');
var Agenda = require('../model/Agenda');

var AgendaView = React.createClass({

    mixins: [SwarmMixin],

    onSelected: function (ev) {
        console.warn('selected');
        var talkId = ev.currentTarget.getAttribute('id');
        var m = talkId.match(/(\d+:\d+)_(.+)/);
        if (!m) return;
        var slot = m[1], track=m[2];
        var oldVal = this.sync.agenda[slot];
        var toAttend = oldVal===track ? '' : track;
        this.sync.attend({
            slot: m[1],
            track: toAttend
        });
    },

    render: function () {
        var agenda = this.sync;
        var self = this;

        var titles = [ '' ];
        for(var track in Agenda.PROGRAM) titles.push(track);
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
                        className: clazz,
                        onClick: self.onSelected
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

        return React.DOM.table({
        },rows);
    }

});

module.exports = AgendaView;
