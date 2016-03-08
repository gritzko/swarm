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
        var options = {}, args_o = args.O || [], patch = [];
        if (args.option) {
            args_o = args_o.concat(args.option);
        }
        args_o.forEach( function(kv) {
            var m = kv.match(/(\w+)=(.*)/);
            if (m) {
                patch.push(new Swarm.Op('!0.'+m[1], m[2]));
            } else {
                console.warn('invalid option syntax:', kv);
            }
        });

        var db_name = args.create || 'test';
        var hs_spec = new Swarm.Spec('/Swarm#'+db_name+'!swarm.on');
        var hs_op = Swarm.Op.create([hs_spec, '', patch]);
        args.v && console.warn('db init with:', hs_op.toString());
        db.put('.on', hs_op.toString(), done);
    });
}
module.exports = create;
