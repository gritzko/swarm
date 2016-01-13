var i, on_end, next;

module.exports = function level_dump (db, prefix, cb) {
    var options = {};
    if (prefix) {
        options.gte = prefix;
        options.lt = prefix + '~';
    }
    i = db.iterator(options);
    on_end = cb;
    next = i.next.bind(i, print);
    next();
}

function print (err, key, val) {
    if (err) {
        console.error(err);
        i.end(function(){
            on_end&&on_end();
        });
    } else if (key) {
        console.log(key+'\t'+val);
        setImmediate(next);
    } else {
        i.end(function(){
            on_end&&on_end();
        });
    }
}
