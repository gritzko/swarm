"use strict";

/**
 *   Rule returns: truthy value || 
 * */
function create (rules) {
    var fn = function (params) {
        this.yield_queue = [];
        this.wait_for = undefined;
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

function make_fn (target, callback) {
    console.log('making',target);
    var self = this, m = undefined;
    // find a matching rule
    for(var i=0; i<self.rule_keys.length; i++) {
        var key = self.rule_keys[i];
        if (key.constructor===String) { 
            if (key===target) { break; }
        } else {
            m = key.exec(target);
            if (m && m[0]===target) {
                console.log('\tmatch',m);
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
        console.log('DONE', target, err, (''+value).substr(0,50));
        // callback exit
        if (err) {
            callback(err);
        } else if (value!==undefined) {
            self[target] = value;
            callback(null, value);
        } else { // yield or wait
            callback("what can I do?");
        }
    }, m );
    // rules may choose to return values either by return or by callback
    if (ret===undefined) {
        if (self.wait_for) { // needs something
            // FIXME avoid concurrent call
            var next = self.wait_for;
            self.wait_for = undefined;
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
    this.wait_for = key;
}

