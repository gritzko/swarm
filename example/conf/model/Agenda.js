"use strict";

var Syncable = require('../../../lib/Syncable');
var Model = require('../../../lib/Model');

// no "set" op
// special logix
// time slots and tracks are fixed
var Agenda = Syncable.extend('Agenda', {

    defaults: {
        _oplog: Object,
        agenda: Object
    },

    ops: {
        attend: function (spec,val,lstn) {
            // get author (strip ssn)

            // sometimes, the newly arrived op is already overwritten
            // by a preexisting concurrent op; let's detect that
            var myVer = '!' + spec.version();
            for(var oldSpec in this._oplog) {
                if (oldSpec>myVer) {
                    var oldVal = this._oplog[oldSpec];
                    if (oldVal.slot===val.slot) {
                        return; // rewritten already
                    }
                }
            }
            this.agenda[val.slot] = val.track;
        }
    },

    // Purge overwritten operations.
    distillLog: function () {
        var slotMax = {};
        for(var spec in this._oplog) {
            var val = this._oplog[spec];
            var prevSpec = slotMax[val.slot];
            if (prevSpec) {
                if (spec>prevSpec) {
                    delete this._oplog[prevSpec];
                    slotMax[val.slot] = spec;
                } else {
                    delete this._oplog[spec];
                }
            } else {
                slotMax[val.slot] = spec;
            }
        }
    },

    // oplog-only diff
    diff: Model.prototype.diff

});

module.exports = Agenda;

// Well, this should be in the model too, but let's simplify a bit
Agenda.SLOTS = ['09:00','10:30','13:30','15:00'];
Agenda.TRACKS = ['Consistency','Availability','Partition tolerance'];
Agenda.PROGRAM = {
    'Consistency': {
        '09:00': {
            title:'The promise and perils of NewSQL',
            speakers:'N. Shamgunov'
        },
        '10:30': {
            title:'Scaling MySQL way beyond reasonable limits',
            speakers:''
        },
        '13:30': {
            title:'Spanner: megalomaniac like everything we do',
            speakers:'G.O.Ogler'
        },
        '15:00': {
            title:'Resolving the Great Papal Schism using pen and paper',
            speakers:'Martin V Colonna'
        }
    },
    'Availability': {
        '09:00': {
            title: 'Dead slaves',
            speakers: 'H. Beecher Stowe'
        },
        '10:30': {
            title:'Avoiding minority reports in Paxos',
            speakers:'Tom Cruise'
        },
        '13:30': {
            title:'RTT of 1 year: latency compensation in 16th cent. Spain',
            speakers:'Philip II of Spain'
        },
        '15:00': {
            title:'to be announced',
            speakers:''
        }
    },
    'Partition tolerance': {
        '09:00': {
            title:'Bow-wow hood.ie',
            speakers:'I.P. Pavlov'
        },
        '10:30': {
            title:'Maintaining offline-mode ATMs',
            speakers:'Elvis R. Rodriguez '
        },
        '13:30': {
            title:'Splitting worms for fun and profit',
            speakers:''
        },
        '15:00': {
            title:'CouchDB and me',
            speakers:'H. Simpson'
        }
    }
};
