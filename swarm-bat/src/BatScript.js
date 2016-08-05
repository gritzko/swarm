"use strict";

/** BatScript parses a BATT script into JSON and vice-versa.
 *
 *  script:
 *
 *      ; simple default-stream exchange
 *      > input to feed
 *      < expected output
 *      ; a new stream, multiline exchange
 *      stream2> one line of input
 *      stream2< expected output 1
 *      stream2< expected output 2
 *      ; concurrent multistream i/o
 *      > input to the default stream
 *      stream2> input to another stream
 *      response line 1
 *      response line 2
 *      stream2< single-line response
 *
 *  nice JSON:
 *
 *      [  {
 *              comment: "simple default-stream exchange",
 *              input:   "input to feed",
 *              output:  "expected output"
 *         },
 *         {
 *              comment: "a new stream, multiline exchange",
 *              input: {"stream2": "one line of input"},
 *              output: { stream2: [
 *                          "expected output 1",
 *                          "expected output 2"
 *                      ] }
 *         },
 *         {
 *              comment: "concurrent multistream i/o",
 *              input: {
 *                          default: "input to the default stream",
 *                          stream2: "input to another stream"
 *                     },
 *              output: {
 *                          default: [
 *                              "response line 1",
 *                              "response line 2"
 *                          ],
 *                          stream2: "single-line response"
 *                      }
 *         }
 *      ]
 *
 *  normalized rounds:
 *
 *      [  {
 *              comment:  "simple default-stream exchange",
 *              input:   {"default": "input to feed\n"},
 *              output:  {"default": "expected output\n"}
 *         },
 *         {
 *              comment: "a new stream, multiline exchange",
 *              input: {"stream2": "one line of input\n"},
 *              output: {"stream2":
 *                          "expected output 1\n"+
 *                          "expected output 2\n"
 *                      }
 *         },
 *         {
 *              comment: "concurrent multistream i/o",
 *              input: {
 *                          default: "input to the default stream\n",
 *                          stream2: "input to another stream\n"
 *                     },
 *              output: {
 *                          default:
 *                              "response line 1\n" +
 *                              "response line 2\n",
 *                          stream2: "single-line response\n"
 *                      }
 *         }
 *      ]
 *
 */
class BatScript {

    constructor (value, options) {
        this._rounds = Object.create(null);
        this.options = options || Object.create(null);
        if (value.constructor===String) {
            this.parseScript(value);
        } else if (value.constructor===Array) {
            this.parseJSON(value);
        } else {
            throw new Error("unrecognized script format");
        }
    }

    parseScript (script_text) {
        var rounds = this._rounds = [];
        var round = null;
        function addRound () {
            round = {
                comment: "",
                input:   Object.create(null),
                output:  Object.create(null)
            };
            rounds.push(round);
        }
        function addLine (map, stream, body) {
            if (undefined===map[stream]) {
                map[stream] = "";
            }
            // TODO trim
            map[stream] += body+'\n';
        }
        addRound();
        //var lines = script_text.match('\n').reverse();
        var m = null;
        var stage = 0;
        var re_mark = /^(([<>;])|(\w+)([<>])|)\s?(.*)\n?/mg;
        var comment = "";
        while ( null != (m = re_mark.exec(script_text)) ) {
            if (m[0].length===0) { break; }
            var type = m[2]||m[4]||'<';
            var stream = m[3] || 'default';
            var body = m[5];
            switch (type) {
                case ';':
                    comment += trim(body);
                    break;
                case '>':
                    if (stage===1) {
                        addRound();
                        stage = 0;
                    }
                    addLine(round.input, stream, body);
                    break;
                case '<':
                    if (stage===0) {
                        stage=1;
                    }
                    if (comment) {
                        round.comment += comment;
                        comment = "";
                    }
                    addLine(round.output, stream, body);
                    break;
            }
        }
    }

    static normalize (value) {
        var ret = Object.create(null);
        if (value===undefined || value===null) {
            return ret;
        } else if (value.constructor===String) {
            ret.default = nl(value);
        } else if (value.constructor===Array) {
            ret.default = nl(value.join('\n'));
        } else if (value.constructor===Object) {
            Object.keys(value).forEach(stream_id => {
                let val = value[stream_id];
                if (val.constructor===String) {
                    ret[stream_id] = nl(val);
                } else if (val.constructor===Array) {
                    ret[stream_id] = nl(val.join('\n'));
                } else {
                    throw new Error("invalid JSON at key "+stream_id);
                }
            });
        }/* else if (value.constructor===Map) {
            value.keys().forEach(stream_id => {
                let val = value[stream_id];
                if (val.constructor===Array) {
                    ret[stream_id] = val.join('\n')+'\n';
                } else if (val.constructor===String) {
                    if (val.lastIndexOf('\n')!=val.length-1) {
                        val = val + '\n';
                    }
                    ret[stream_id] = val;
                }
            });
        }*/
        return ret;
    }

    parseJSON (exchanges) {
        this._rounds = exchanges.map( val => {
            return {
                comment: val.comment ? nl(val.comment) : "",
                input: BatScript.normalize(val.input),
                output: BatScript.normalize(val.output)
            };
        });
    }

    get rounds () {
        return this._rounds;
    }

    get size () {
        return this._rounds.length;
    }

    static input2script (input) {
        var script = "";
        Object.keys(input).sort().forEach(stream => {
            let label = (stream!=="default" ? stream : '') + '> ';
            let text = input[stream];
            script += text.replace(/.*\n/mg, label+"$&");
        });
        return script;
    }

    static output2script (output, options) {
        var script = "";
        Object.keys(output).sort().forEach(stream => {
            let text = output[stream];
            let label = '';
            if (stream!=="default") {
                label = stream +'< ';
            } else if (text.match(/^[<>]/)) {
                label = '< ';
            }
            if (options && options.ignoreCase) {
                text = text.toUpperCase();
            }
            if (options && options.collapseWhitespace) {
                text = text.replace(/^\s+/mg, '');
                text = text.replace(/\s+$/mg, '');
                text = text.replace(/[ \t]+/mg, ' ');
            }
            if (options && options.anyOrder) {
                text = text.split('\n').sort().join('\n');
            }
            script += text.replace(/.*\n/mg, label+"$&");
        });
        return script;
    }

    static round2script (round) {
        var script = "";
        if (round.comment) {
            script += nl('; ' + round.comment);
        }
        script += BatScript.input2script(round.input);
        script += BatScript.output2script(round.output);
        return script;
    }

    toString () {
        var script = "";
        this._rounds.forEach( round => {
            script += BatScript.round2script(round);
        });
        return script;
    }

}

function nl (line) {
    return line.lastIndexOf('\n')==line.length-1 ? line : line+'\n';
}

function trim (line) {
    return line.replace(/^\s+/mg,'').replace(/\s+$/mg,'');
}

module.exports = BatScript;