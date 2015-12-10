"use strict";
// TODO LearnedComparator.js
var variable_re = 
/([^\$]*)(\$([A-Z0-9_]+)|\${([A-Z0-9_]+)(?:\/([^\/]+)\/)?}|\$(\*))([^\$]*)/;

function LearnedComparator () {
    this.variables = {};
}
module.exports = LearnedComparator;

LearnedComparator.prototype.compare = function (fact, expected) {
    var round = new ComparatorRound(fact, expected, this.variables);
    round.run();
    return round;
};


function ComparatorRound (fact, expected, variables) {
    this.matched = '';
    this.ok = true;
    this.variables = variables || {};
    this.expected = expected;
    this.fact = fact;
}


ComparatorRound.prototype.chunkCmp = function (fact_str, exp_str, var_name) {
    if (!this.ok) {return;}
    // TODO paranoic
    if (var_name!==undefined) {
        if (var_name==='*') {
            this.matched += fact_str;
            this.fact = this.fact.substr(fact_str.length);
            this.expected = this.expected.substr(exp_str.length);
        } else if (var_name in this.variables) {
            if (fact_str===undefined) {
                fact_str = this.fact.substr(0, this.variables[var_name].length);
            }
            if (fact_str===this.variables[var_name]) {
                this.matched += fact_str;
                this.fact = this.fact.substr(fact_str.length);
                this.expected = this.expected.substr(exp_str.length);
            } else {
                this.ok = false;
            }
        } else {
            this.variables[var_name] = fact_str;
        }
    } else {
        var prefix = this.fact.substr(0,exp_str.length);
        if (prefix===exp_str) {
            this.matched += prefix;
            this.fact = this.fact.substr(prefix.length);
            this.expected = this.expected.substr(prefix.length);
        } else {
            this.ok = false;
        }
    }
    return this.ok;
};


ComparatorRound.prototype.match = function 
    ( prefix, postfix, var_expr, var_name, regex ) 
{
    if (!this.ok) {return;}
    if (prefix) {
        this.chunkCmp(undefined, prefix, undefined);
    }
    if (var_name && (var_name in this.variables)) {
        this.chunkCmp(undefined, var_expr, var_name);
    } else if (postfix) {
        var i = this.fact.indexOf(postfix);
        if (i===-1) { 
            this.ok = false;
            return;
        }
        var value = this.fact.substr(0,i);
        this.chunkCmp(value, var_expr, var_name);
    } else if (regex) {
        var dyn_re = new RegExp(regex);
        var mm = dyn_re.exec(this.fact);
        if (mm===null || mm.index!==0) {
            this.ok = false;
            return;
        }
        this.chunkCmp(mm[0], var_expr, var_name);
    } else if (var_name==='*') { // grab-all
        this.chunkCmp(this.fact, var_expr, var_name);
    } else {
        console.error('undefined matching straregy for',var_name);
        // TODO  $*$/regex/$* matching
        this.ok = false;
        return;
    }
};

ComparatorRound.prototype.run = function () {
    var m = variable_re.exec(this.expected);
    // 1 seek var  $VAR  ${VAR}  ${/regex/VAR}
    while  ( m && this.ok  ) {
        var prefix = m[1];
        var var_expr = m[2];
        var var_name = m[3]||m[4]||m[6];
        var regex = m[5];
        var postfix = m[7];

        this.match( prefix, postfix, var_expr, var_name, regex );

        m = variable_re.exec(this.expected);
    }

    if (this.expected || this.fact) {
        this.chunkCmp(undefined, this.expected, undefined);
    }

};