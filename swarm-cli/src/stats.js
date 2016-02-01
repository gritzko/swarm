"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');

function create (args, done) {

    var home = args.home;

    var db = leveldown(home);
    db.open({}, function read(err) {
        if (err) {
            return done(err);
        }
        args.v && console.warn('database opened');
        db.get('.on', {asBuffer: false}, printAll);
    });


    function printAll (err, value) {
        if (err) {
            return done(err);
        }
        args.v && console.warn('handshake read OK', JSON.stringify(value));
        var hs = Swarm.Op.parse(value+'\n').ops[0];
        console.log('== Handshake string ==\n', JSON.stringify(value));
        console.log('\n== Swarm db ==');
        console.log('Handshake' +':\t'+ hs.spec.toString());
        console.log('Database' +':\t'+ hs.id());
        console.log('Replica' +':\t'+ (hs.origin() ? hs.origin() : '(blank)'));
        console.log('\n== Swarm db options ==');
        hs.patch && hs.patch.forEach(function(o){
            console.log(o.name() +':\t'+ o.value);
        });
        console.log('\n== leveldb stats ==');
        var lp = db.getProperty('leveldb.stats');
        console.log(lp);
    }

    /*    // write down the handshake, options
        var opt_keys = Object.keys(args).filter(function(o){
            // FIXME syntax
            return o[0]==='D';
        });
        var options = opt_keys.map(function(k){
            return new Swarm.Op('.'+k, args[k]);
        });
        var db_name = args.create || 'test';
        var hs_spec = new Swarm.Spec('/Swarm#'+db_name+'!0.on');
        var hs_op = new Swarm.Op(hs_spec, '', options);
    });*/
}
module.exports = create;
