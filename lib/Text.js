"use strict";

var Spec = require('./Spec');
var Syncable = require('./Syncable');

var Text = Syncable.extend('Text', {
    // naive uncompressed CT weave implementation
    defaults: {
        weave: '\n',
        ids: {type:Array, value:'00000+swarm'},
        text: '',
        _oplog: Object
    },

    neutrals: {
        state: function (spec, text, src) {
            console.log('what?');
        }
    },
    ops: {
        insert: function (spec, ins, src) {
            var w1 = [], w4 = [];
            var vt = spec.token('!'), v = vt.bare;
            var ts = v.substr(0, 5), seq = v.substr(5) || '00';
            var seqi = Spec.base2int(seq);
            for (var i = 0; i < this.weave.length; i++) {
                var id = this.ids[i];
                w1.push(this.weave.charAt(i));
                w4.push(id);
                if (id in ins) {
                    var str = ins[id].toString();
                    var k = i + 1;
                    while (k < this.weave.length && this.ids[k] > vt.body) {
                        k++;
                    }
                    if (k > i + 1) { // concurrent edits
                        var newid = this.ids[k - 1];
                        ins[newid] = ins[id];
                        delete ins[id];
                    } else {
                        for (var j = 0; j < str.length; j++) {
                            w1.push(str.charAt(j)); // FIXME overfill
                            var genTs = ts + (seqi ? Spec.int2base(seqi++, 2) : '') + '+' + vt.ext;
                            w4.push(genTs);
                            if (!seqi) {
                                seqi = 1; // FIXME repeat ids, double insert
                            }
                        }
                    }
                }
            }
            if (genTs) {
                this._host.clock.checkTimestamp(genTs);
            }
            this.weave = w1.join('');
            this.ids = w4;
            this.rebuild();
        },
        remove: function (spec, rm, src) {
            var w1 = [], w4 = [];
            var v = spec.version();
            for (var i = 0; i < this.weave.length; i++) {
                w1.push(this.weave.charAt(i));
                w4.push(this.ids[i]);
                if (this.ids[i] in rm) {
                    w1.push('\u0008');
                    w4.push(v);
                }
            }
            this.weave = w1.join('');
            this.ids = w4;
            this.rebuild();
        }
    },
    rebuild: function () {
        /*var re = /([^\u0008][\u0008]+)|([^\u0008])/g, m=[];
         var text = [], tids = [], pos = 0;
         while (m=re.exec(this.weave)) {
         if (m[2]) {
         text.push(m[2]);
         tids.push(this.ids[pos]);
         }
         pos += m[0].length;
         }

         this.tids = tids;*/
        this.text = this.weave.replace(/[^\u0008][\u0008]+/mg, '').substr(1);
    },
    set: function (newText) {
        var patch = Text.diff(this.text, newText);
        var rm = null, ins = null, weave = this.weave;
        var re_atom = /[^\u0008]([^\u0008][\u0008]+)*/mg;
        var atom;

        function skip(n) {
            for (n = n || 1; n > 0; n--) {
                atom = re_atom.exec(weave);
            }
        }

        skip(1); // \n #00000+swarm

        for (var i = 0; i < patch.length; i++) {
            var op = patch[i][0], val = patch[i][1];
            switch (op) {
            case '+':
                ins || (ins = {});
                ins[this.ids[atom.index]] = val;
                break;
            case '-':
                rm || (rm = {});
                for (var r = 0; r < val.length; r++) {
                    rm[this.ids[atom.index + atom[0].length]] = true;
                    skip();
                }
                break;
            case '=':
                skip(val.length);
            }
        }
        rm && this.remove(rm);
        ins && this.insert(ins);
    }
});

Text.diff = function diff(was, is) {
    var ret = [];
    // prefix suffix the rest is change
    var pre = 0;
    while (pre < was.length && pre < is.length && was.charAt(pre) === is.charAt(pre)) {
        pre++;
    }
    var post = 0;
    while (post < was.length - pre && post < is.length - pre &&
    was.charAt(was.length - post - 1) === is.charAt(is.length - post - 1)) {
        post++;
    }
    if (pre) {
        ret.push(['=', was.substr(0, pre)]);
    }
    var ins = is.length - pre - post;
    if (ins) {
        ret.push(['+', is.substr(pre, ins)]);
    }
    var rm = was.length - pre - post;
    if (rm) {
        ret.push(['-', was.substr(pre, rm)]);
    }
    if (post) {
        ret.push(['=', was.substr(pre + rm)]);
    }
    return ret;

};

module.exports = Text;
