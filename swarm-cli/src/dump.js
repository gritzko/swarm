"use strict";
var leveldown = require('leveldown');
var i, on_end, next;

function dump (args, done) {
    on_end = done;
    var db = leveldown(args.home);
    args.access = args.access || args.a || '';
    args.put = args.put || args.P;
    args.erase = args.erase || args.E;
    db.open(function(err){
        if (err) {
            return done(err);
        }
        if (args.put) {
            put(db, args, done);
        } else if (args.erase) {
            erase(db, args, done);
        } else {
            read(db, args, done);
        }
    });
}

function read (db, args, done) {
    scan(db, args, function (key, value) {
        console.log(key+'\t'+value);
    }, done);
}
module.exports = dump;

function scan (db, args, on_entry, on_end) {
    var options = {};
    var prefix = args.access===true ? null : args.access;
    if (prefix) {
        options.gte = prefix;
        options.lt = prefix + '~';
    }
    args.v && console.warn('scanning db',prefix?'prefix '+prefix:'(all)');
    i = db.iterator(options);
    i.next(read_loop);
    var next_bound = i.next.bind(i, read_loop);

    function read_loop (err, key, val) {
        if (err) {
            console.error(err);
            i.end(on_end);
        } else if (key) {
            on_entry(key, val);
            //i.next(read_loop);
            setImmediate(next_bound);
        } else {
            i.end(on_end);
        }
    }
}

function put (db, args, done) {
    var key = args.access;
    var value = args.put;
    db.put(key, value, done);
}

function Del (key) {
    this.type = 'del';
    this.key = key;
    this.value = null;
}

function erase (db, args, done) {
    var keys = [];
    scan(db, args, (key, val) => keys.push(key), batch_erase);
    function batch_erase () {
        if (args.v) {
            console.warn('erasing keys:');
            keys.map(key => console.warn('\t', key.toString()));
            console.warn('(end of list)');
        }
        var ops = keys.map(key => new Del(key));
        db.batch(ops, done);
    }
}
