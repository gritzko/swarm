"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');

function create (args, done) {

    var home = args.home;
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }

    var db = leveldown(home);
    db.open({}, function init(err) {
        if (err) {
            return done(err);
        }
        args.v && console.warn('database', home, 'opened');
        // write down the handshake, options
        var opt_keys = Object.keys(args).filter(function(o){
            // FIXME syntax
            return o.charAt(0)==='D';
        });
        var options = opt_keys.map(function(k){
            return new Swarm.Op('!0.'+k.substr(1), args[k]);
        });
        var db_name = args.create || 'test';
        var hs_spec = new Swarm.Spec('/Swarm#'+db_name+'!0.on');
        var hs_op = new Swarm.Op(hs_spec, '', null, options);
        args.v && console.warn('db init with:', hs_op.toString());
        db.put('.on', hs_op.toString(), done);
    });
}
module.exports = create;
