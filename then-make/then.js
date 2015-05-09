"use strict";

/**
 *   Rule returns: truthy value || 
 * */
function create (rules) {
    var fn = function (params) {
        this.yield_queue = [];
        this.yield_for = undefined;
        for(var name in rules) {
            this[name] = undefined;
        }
        for(var key in params) {
            this[key] = params[key];
        }
    };
    fn.prototype.yield = yield_fn;
    fn.prototype.make = make_fn;
    fn.prototype.rule_keys = [];
    fn.prototype.rule_fns = [];
    var m;
    for(var key in rules) {
        if (m=/^\/(.+)\/$/.exec(key)) {
            fn.prototype.rule_keys.push(new RegExp(m[1]));
        } else {
            fn.prototype.rule_keys.push(key);
        }
        fn.prototype.rule_fns.push(rules[key]);
    }
    return fn;
}

module.exports = create;
create.trace = false;

function make_fn (target, callback) {
    create.trace && console.log('>make',target);
    var self = this, m = undefined;
    // find a matching rule
    for(var i=0; i<self.rule_keys.length; i++) {
        var key = self.rule_keys[i];
        if (key.constructor===String) { 
            if (key===target) { break; }
        } else {
            m = key.exec(target);
            if (m && m[0]===target) {
                break;
            }
        }
    }
    if (i===self.rule_keys.length) {
        return callback('no rule for: '+target);
    }
    var rule = self.rule_fns[i];
    // launch a rule
    var ret = rule.call ( self, target, function done (err, value) {
        create.trace && console.log('>callback', target, err, (''+value).substr(0,50));
        // callback
        if (err) {
            callback(err);
        } else if (value!==undefined) {
            self[target] = value;
            callback(null, value);
        } else { // yield or wait
            callback("what can I do?");
        }
    }, m );
    create.trace && console.log('>return', target, ret);
    // rules may choose to return values either by return or by callback
    if (ret===undefined) {
        if (self.yield_for) { // needs something
            create.trace && console.log('>need', self.yield_for);
            // FIXME avoid concurrent call
            var next = self.yield_for;
            self.yield_for = undefined;
            //this.yield_queue.push(target);
            self.make(next, function(err, val){
                self.make(target, callback); // reentry
            });
        } else { // waits for a callback
            "let's wait";
        }
    } else {
        self[target] = ret;
        callback(null,ret);
    };
}


function yield_fn (key) {
    create.trace && console.log('>yield',key);
    this.yield_for = key;
}

