"use strict";

/**  Parsed a BATT script into JSON and vice-versa.
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
 * */
module.exports = class BATT {

    constructor (script_text) {
        this.exchanges = [];
        this.addExchange();
        var lines = script_text.split('\n').reverse();
        var stage = 0;
        var re_mark = /^(([<>;])|(\w+)([<>])|)(.*)/;
        while (lines.length>0) {
            var line = lines.pop();
            var m = line.match(re_mark);
            var type = m[2]||m[4]||'<';
            var stream = m[3] || 'default';
            var body = m[5];
            switch (type) {
                case ';':
                    this.addCommentLine(body);
                    break;
                case '>':
                    if (stage===1) {
                        this.addExchange();
                        stage = 0;
                    }
                    this.addInputLine(body, stream);
                    break;
                case '<':
                    if (stage===0) {
                        stage=1;
                    }
                    this.addOutputLine(body, stream);
                    break;
            }
        }
    }

    addExchange (next) {
        if (next === undefined) {
            next = {
                comment: null,
                input: null,
                output: null
            };
        }
        return this.exchanges.push(next);
    }

    addLine (action_name, line, stream, x) {
        if (x===undefined) {
            x = this.exchanges.length-1;
        }
        if (stream===undefined) {
            stream = 'default';
        }
        var exchange = this.exchanges[x];
        var action_value = exchange[action_name];
        var form = action_value && action_value.constructor;
        if (form===null) {
            if (stream==='default') {
                action_value = exchange[action_name] = line;
            } else {
                var new_value = Object.create(null);
                new_value[stream] = line;
                exchange[action_name] = new_value;
            }
        } else if (form===String) {
            if (stream==='default') {
                exchange[action_name] = [ action_value, line ];
            } else {
                new_value = Object.create(null);
                new_value["default"] = action_value;
                new_value[stream] = line;
                exchange[action_name] = new_value;
            }
        } else if (form===Object) {
            var stream_value = action_value[stream];
            if (stream_value===undefined) {
                action_value[stream] = line;
            } else if (stream_value.constructor===String) {
                action_value[stream] = [stream_value, line];
            } else {
                stream_value.push(line);
            }
        }
    }

    addInputLine (line, stream, x) {
        this.addLine("input", line, stream, x);
    }

    addOutputLine (line, stream, x) {
        this.addLine("output", line, stream, x);
    }

    addCommentLine (line, stream, x) {
        this.addLine("comment", line, stream, x);
    }

    // returns exchange action lines
    listLines (x, action_name) {
        var action_value = this.exchanges[x][action_name];
        if (action_value===null || action_value===undefined) {
            return [];
        } else if (action_value.constructor===String) {
            return [["default", action_value]];
        } else if (action_value.constructor===Array) {
            return action_value.map(line => ["default", line]);
        } else if (action_value.constructor===Object) {
            var ret = [];
            for( var stream of Object.keys(action_value) ) {
                var list = action_value[stream];
                if (list.constructor===String) {
                    ret.push([stream, list]);
                } else {
                    ret = ret.concat(list.map(
                        line => [stream, line]
                    ));
                }
            }
            return ret;
        }
    }

    get size () {
        return this.exchanges.length;
    }

    toString () {
        var ret = "";
        for(let i=0; i<this.size; i++) {
            var comments = this.listLines(i, "comment");
            ret += comments.map(pair => ';'+pair[1]+'\n').join();
            var inputs = this.listLines(i, "input");
            ret += inputs.map( pair =>
                (pair[0]=="default"?'':pair[0]) + '>' + pair[1] + '\n'
            );
            var outputs = this.listLines(i, "output");
            ret += outputs.map( pair =>
                (pair[0]=="default"?'':pair[0]+'<') + pair[1] + '\n'
            );
        }
        return ret;
    }

    toJSON () {
        return this.exchanges;
    }

}
