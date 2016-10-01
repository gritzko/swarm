"use strict";

/** node url lib 0.7KLoC and that is too much. We support a limited subset of
 *  URL syntax using regex-based parsing */
class URL {

    constructor (url) {
        URL.RE_URI.lastIndex = 0;
        const m = URL.RE_URI.exec(url);
        if (!m)
            throw new Error('invalid URL syntax');
        this.url = m[0];
        this.scheme = m[1].split('+');
        this.creds = m[2];
        this.replica = undefined;
        this.password = undefined;
        this.hostname = m[3];
        this.port = m[4] ? parseInt(m[4]) : 0;
        this.host = this.hostname ?
            this.hostname + (this.port?':'+this.port:'') : undefined;
        this.path = m[5];
        this.basename;
        this.search = m[6];
        this.query;
        this.hash = m[7];
    }

    get protocol () {
        return this.scheme.join('+');
    }

    clone () {
        return new URL(this.toString());
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
    "^(?:([\\w\\-]+(?:\\+[\\w\\-]+)*):)" +    // scheme
    "(?://" +
        "(?:([^/?#\\s]*)@)?" +                  // credentials
        "((?:[^/?#:@\\s]+\\.)*[^/?#:@\\s]+)" + // domain
        "(?::([0-9]+))?" +                    // port
    ")" +
    "(/[^?#'\"\\s]*)?" +         // path
    "(?:\\?([^'\"#\\s]*))?" +   // query
    "(?:#(\\S*))?$",            // fragment
    "gi"
);


module.exports = URL;