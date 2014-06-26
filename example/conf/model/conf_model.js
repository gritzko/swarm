if (typeof exports === 'object') {
    Swarm = require('../../../lib/swarm3.js');
}

// no "set" op
// special logix
// time slots and tracks are fixed
var Agenda = Swarm.Syncable.extend('Agenda', {

    defaults: {
        _oplog: Object,
        agenda: Object
    },

    ops: {
        attend: function (spec,val,lstn) {
            // get author (strip ssn)
            
            // cancel overlaps
            //if (spec.version()<this._version.substr(1)) { // reordering
                var myVer = '!' + spec.version();
                for(var oldSpec in this._oplog) {
                    if (oldSpec>myVer) {
                        var oldVal = this._oplog[spec];
                        if (oldVal.slot===val.slot)
                            return; // rewritten already
                    }
                }
            //}
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
    diff: Swarm.Model.prototype.diff
   
});

if (typeof(exports)==='object') {
    exports.Agenda=Agenda;
}

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
            title:'Spanner: megalomaniac like everything we do, G.O.Ogler', 
            speakers:''
        },
        '15:00': {
            title:'Resolving the Great Papal Schism, Holy Father Martin V', 
            speakers:''
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
            title:'Latency compensation in early modern Spain', 
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
