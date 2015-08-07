"use strict";
var BatStream = require('./BatStream');

/** The class is mostly useful to test text-based, line-based protocols.
    It multiplexes/demultiplexes several text streams to/from a single
    tagged stream. The tag is normally [tag].
    May also act as a quasi-server, so
        new TestMux('mux1')
        test_stream.connect('test:mux1#tag')
    will lead to every write
        test_stream.write('something')
    being sent into mux1 trunk as
        '[tag]something'
*/
function BatMux (id, server_uri) {
    this.server_uri = server_uri;
    this.trunk = new BatStream();
    this.branches = {};
    this.active_tag_r = '';
    this.active_tag_w = '';
    this.trunk.pair.on('data', this.onTrunkDataIn.bind(this));
}
module.exports = BatMux;
BatMux.tag_re = /\[([\w\:\/\#\.\_\~]+)\]/;

BatMux.prototype.bat_connect = function (uri, bat_stream) {
    var self = this;
    var tag = uri; // TODO parse
    this.branches[tag] = bat_stream;
    bat_stream.on('data', function(data){
        self.onBranchDataIn(tag, data);
    });
    bat_stream.on('end', function(){
        self.onBranchEnd(tag);
    });
};

BatMux.prototype.onBranchDataIn = function (tag, data) {
    if (this.active_tag_w!==tag) {
        this.active_tag_w = tag;
        this.trunk.pair.write('['+tag+']');
    }
    this.trunk.pair.write(data.toString());
};

BatMux.prototype.onBranchEnd = function (tag) {
    if (this.active_tag_w!==tag) {
        this.active_tag_w = tag;
        this.trunk.pair.write('['+tag+']');
    }
    this.trunk.pair.write('[EOF]');
    this.branches[tag] = null;
};

BatMux.prototype.addBranch = function (tag) {
    var stream = new BatStream(), self = this;
    this.branches[tag] = stream;
    stream.on('data', function(data){
        self.onBranchDataIn(tag, data);
    });
    stream.on('end', function(){
        self.onBranchEnd(tag);
    });
    stream.connect(this.server_uri);
};

BatMux.prototype.onTrunkDataIn = function (data) {
    var str = data.toString();
    while ( str ) { // todo  "[str" "eam]"
        var m = BatMux.tag_re.exec(str);
        var tag = m ? m[1] : null;
        var pre = m ? str.substr(0, m.index) : str;
        str = m ? str.substr(m.index + m[0].length) : null;
        if (pre) {
            var stream = this.branches[this.active_tag_r];
            if (stream!==null) {
                stream.write(pre);
            }
        }
        if (tag && tag!==this.active_tag_r) {
            this.active_tag_r = tag;
            if (!(tag in this.branches)) {
                this.addBranch(tag);
            }
        }
    }
};
