"use strict";
var BatScript = require('./BatScript');
var DiffMatchPatch = require('diff-match-patch');
var chalk = require('chalk');

class BatResult {

    constructor (round, output, options) {
        this.ok = true;
        this.input = round.input;
        this.expected = round.output;
        this.output = output;
        var expected_norm = BatScript.output2script
            (this.expected, options);
        var output_norm = BatScript.output2script
            (this.output, options);
        const dmp = new DiffMatchPatch();
        var diff = dmp.diff_main(output_norm, expected_norm);
        dmp.diff_cleanupSemantic(diff);
        this.ok = diff && (diff.length===0 || (diff.length===1 && diff[0][0]===0));
        this.diff = diff;
        this.comment = round.comment;
    }

    toColorString () {
        var colors = [
            chalk.strikethrough.magenta,
            chalk.dim,
            chalk.underline.yellow
        ];
        var ret = (this.ok ? chalk.green('[ OK ]\t') : chalk.red('[FAIL]\t'));
        ret += chalk.gray(this.comment)+'\n';
        if (!this.ok) {
            this.diff.forEach(span => ret += colors[1 + span[0]](span[1]));
        }
        return ret;
    }

}

module.exports = BatResult;