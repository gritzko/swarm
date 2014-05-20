Swarm.Syncable.prototype.log = function (spec, value, replica) {
    var myspec = this.spec().toString(); //:(
    console.log(
            "%c@%s  %c%s%c%s  %c%O  %c%s@%c%s",
            "color: #888",
                this._host._id,
            "color: #246",
                this.spec().toString(),
            "color: #024; font-style: italic",
                (myspec==spec.filter('/#')?
                    spec.filter('!.').toString() :
                    ' <> '+spec.toString()),  // FIXME ONLY MY SPEC
            "font-style: normal; color: #042",
                (value&&value.constructor===Swarm.Spec?value.toString():value),
            "color: #88a",
                (replica&&((replica.spec&&replica.spec().toString())||replica._id)) ||
                (replica?'no id':'undef'),
            "color: #ccd",
                replica&&replica._host&&replica._host._id
            //replica&&replica.spec&&(replica.spec()+
            //    (this._host===replica._host?'':' @'+replica._host._id)
    );
};

function WSStream (url) {
    var self = this;
    var ln = this.lstn = {};
    var ws = this.ws = new WebSocket(url);
    var buf = this.buf = [];
    ws.onopen = function () {
        buf.reverse();
        self.buf = null;
        while (buf.length)
            self.write(buf.pop());
            
    };
    ws.onclose = function () { ln.close && ln.close() };
    ws.onmessage = function (msg) { ln.data && ln.data(msg.data) };
    ws.onerror = function (err) { ln.error && ln.error(err) };
}

WSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

WSStream.prototype.write = function (data) {
    console.log('writing',data);
    if (this.buf)
        this.buf.push(data);
    else
        this.ws.send(data);
};

Swarm.Pipe.streams.ws = Swarm.Pipe.streams.wss = WSStream;

