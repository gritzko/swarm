if (typeof require == 'function') {
    Swarm = require('../lib/swarm3.js');
}
Spec = Swarm.Spec;
Model = Swarm.Model;

Swarm.diff = function diff (was, is) {
    var ret = [];
    // prefix suffix the rest is change
    for(var pre=0; 
            pre<was.length && pre<is.length && was.charAt(pre)===is.charAt(pre); 
            pre++);
    for(var post=0; 
            post<was.length-pre && post<is.length-pre && 
                was.charAt(was.length-post-1)===is.charAt(is.length-post-1); 
            post++);
    if (pre)
        ret.push(['=',was.substr(0,pre)]);
    var rm = was.length - pre - post;
    if (rm)
        ret.push(['-',was.substr(pre,rm)]);
    var ins = is.length - pre - post;
    if (ins)
        ret.push(['+',is.substr(pre,ins)]);
    if (post)
        ret.push(['=',was.substr(pre+rm)]);
    return ret;
    
}

Swarm.Text = Swarm.Syncable.extend('Text',{
    // naive uncompressed CT weave implementation
    defaults: {
        weave : '\n',
        ids : ['00000+swarm'],
        text : '',
        _oplog : Object
    },

    neutrals: {
        init: function (spec, text, src) {
            console.log('what?');
        }
    },
    methods: {
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
                    for (var k = i + 1; k < this.weave.length && this.ids[k] > vt.body; k++);
                    if (k > i + 1) { // concurrent edits
                        var newid = this.ids[k - 1];
                        ins[newid] = ins[id];
                        delete ins[id];
                    } else {
                        for (var j = 0; j < str.length; j++) {
                            w1.push(str.charAt(j)); // FIXME overfill
                            w4.push(ts + (seqi ? Spec.int2base(seqi++, 2) : '') + '+' + vt.ext);
                        }
                    }
                }
            }
            if (vt.ext === this._host._id)
                this._host.tsSeq = seqi + 1;
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
        this.text = this.weave.replace(/[^\u0008][\u0008]+/mg,'').substr(1);
    },
    set: function (newText) {
        var patch = Swarm.diff(this.text,newText);
        var rm = null, ins = null, pos = 0;
        var re_atom = /[^\u0008][\u0008]*/mg;
        var atom = re_atom.exec(this.weave); // \n #00000+swarm

        function skip (n) {
            n=n||1;
            while (n && (atom=re_atom.exec(this.weave)))
                if (atom[0].length===1)
                    n--;
        }

        for(var i=0; i<patch.length; i++) {
            var op = patch[i][0], val = patch[i][1];
            switch (op) {
                case '+':
                    ins || (ins = {});
                    ins[this.ids[atom.index]] = val;
                    break;
                case '-':
                    rm || (rm={});
                    for(var r=0; r<val.length; r++) {
                        rm[this.ids[atom.index+r+1]] = true;
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
