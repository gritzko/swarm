"use strict";
const swarm = require('swarm-protocol');
const Base64x64 = swarm.Base64x64;

/** node url lib 0.7KLoC and that is too much. We support a limited subset of
 *  URL syntax using regex-based parsing */
class URL {

    constructor (url) {
        URL.RE_URI.lastIndex = 0;
        const m = URL.RE_URI.exec(url);
        if (!m)
            throw new Error('invalid URL syntax: '+url);
        this.url = m[0];
        this.scheme = m[1].split('+');
        this.creds = m[2];
        this.replica = m[3];
        this.password = m[4];
        this.host = m[5];
        this.hostname = m[6];
        this.port = m[7] ? parseInt(m[7]) : 0;
        this.path = m[8];
        this.search = m[9];
        this.query;
        this.hash = m[10];
    }

    get protocol () {
        return this.scheme.join('+');
    }

    get basename () {
        if (!this.path) return undefined;
        const i = this.path.lastIndexOf('/');
        return i===-1 ? this.path : this.path.substr(i+1);
    }

    clone () {
        return new URL(this.toString());
    }

    nested () {
        let next = this.clone();
        next.scheme.shift();
        return next;
    }

    eq (url) {
        return this.toString() === url.toString();
    }

    toString () {
        let ret = this.protocol+':';
        if (this.host)
            ret += '//' + (this.creds?this.creds+'@':'') + this.host;
        if (this.path)
            ret += this.path;
        if (this.search)
            ret += '?' + this.search;
        if (this.hash)
            ret += '#' + this.hash;
        return ret;
    }

}

URL.RE_URI = new RegExp(
   ("^(?:([\\w\\-]+(?:\\+[\\w\\-]+)*):)" +    // scheme
    "(?://" +
        "(?:((B)(?:\\:(\\w+))?)@)?" +                  // credentials
        "(((?:[^/?#:@\\s]+\\.)*[^/?#:@\\s]+)" + // domain
        "(?::([0-9]+))?)" +                    // port
    ")" +
    "(/[^?#'\"\\s]*)?" +         // path
    "(?:\\?([^'\"#\\s]*))?" +   // query
    "(?:#(\\S*))?$")             // fragment
        .replace(/B/g, Base64x64.rs64x64),
    "gi"
);


module.exports = URL;