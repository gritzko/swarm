"use strict";
const Base64x64 = require('./Base64x64');
const UID = require('./UID');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
class Op {

    constructor(int_strings, value_strings) {
        if (int_strings.length!==8)
            throw new Error("not an array of 8 Base64x64 ints");
        this._ints = int_strings;
        this._raw_values = value_strings;
        // values should be passed around *verbatim*, so the
        // serialized form is the canonic form; parsed
        // values are platform/environment dependent.
        this._values = null;
    }

    _parse_values () {
        this._values = this._raw_values.map(Op.ron2js);
    }

    values () {
        if (!this._values) this._parse_values();
        return this._values;
    }

    value (i) {
        if (!this._values) this._parse_values();
        return this._values[i];
    }

    raw_value (i) {
        return this._raw_values[i];
    }

    raw_values () {
        return this._raw_values;
    }

    int (i) {
        return this._ints[i];
    }

    ints () {
        return this._ints;
    }

    TypeUID() {
        return new UID(this.int(0), this.int(1));
    }

    ObjectUID() {
        return new UID(this.int(2), this.int(3));
    }

    EventUID() {
        return new UID(this.int(4), this.int(5));
    }

    LocationUID() {
        return new UID(this.int(6), this.int(7));
    }

    static fromUIDs (uids, values) {
        if (uids.length!==4)
            throw new Error("not an array of 4 uids");
        const ints = [];
        uids.map(UID.as).forEach(uid=>ints.push(uid.time, uid.origin));
        const vals = values.map(Op.js2ron);
        return new Op(ints, vals);
    }

    static fromString(op_string, default_ints) {
        if (default_ints===undefined)
            default_ints = ["0","0","0","0","0","0","0","0"];
        const int_strings = default_ints.slice();
        const value_strings = [];

        let m = null;
        let int_at = 0;
        let offset = 0;
        Op.RE_ZIP_INT_G.lastIndex = offset;
        while (int_at < 8 && (m = Op.RE_ZIP_INT_G.exec(op_string))) {
            if (m[0].length===0) break;
            offset += m[0].length;
            const quant = m[1], redef = m[2], prefix = m[3], tail = m[4];
            if (quant) {
                if (UID.SEPARATORS.indexOf(quant) !== -1) {
                    int_at |= 1;
                } else {
                    const at = Op.UID_SEPS.indexOf(quant) << 1;
                    if (at < int_at)
                        return Op.error("uid order violation");
                    int_at = at;
                }
            }
            let def = default_ints[int_at];
            if (redef && int_at > 1) {
                let new_at = int_at;
                if (redef === Op.RIGHT_REDEF_SEP) {
                    new_at += 2;
                } else if (redef === Op.LEFT_REDEF_SEP) {
                    new_at -= 2;
                }
                if (new_at < 2) { // wrap
                    new_at += 6;
                } else if (new_at >= 8) {
                    new_at -= 6;
                }
                def = new_at < int_at ? int_strings[new_at] : default_ints[new_at];
            }
            if (prefix) {
                const len = Op.PREFIX_SEPS.indexOf(prefix) + 4;
                if (def.length > len)
                    def = def.substr(0, len);
                else while (def.length < len)
                    def += '0';
            }
            if (tail) {
                if (prefix)
                    int_strings[int_at] = (def + tail).substr(0, 10);
                else
                    int_strings[int_at] = tail;
            } else {
                int_strings[int_at] = def;
            }
            int_at++;
        }

        if (!int_at)
            return Op.error("trailing garbage");

        Op.RE_VALUE_G.lastIndex = offset;
        while (m = Op.RE_VALUE_G.exec(op_string)) {
            if (m[0].length===0) break;
            if (value_strings.length===8) break;
            value_strings.push(m[0]);
        }

        if (!value_strings.length)
            return Op.error("no values");

        return new Op(int_strings, value_strings);

    }

    isState () {
        return this.value(0)===Op.FRAME_VALUE;
    }

    isQuery () {
        return this.value(0)===Op.QUERY_VALUE;
    }

    isError () {
        return this.int(4) === Base64x64.INCORRECT;
    }

    toString () {
        let ret = '';
        for(let u=0; u<4; u++) {
            const i = u<<1;
            if (this.int(i)==='0' && this.int(i+1)==='0')
                continue;
            ret += Op.UID_SEPS[u];
            ret += this.int(i);
            if (this.int(i+1)!=='0') {
                ret += UID.TIMESTAMP_SEPARATOR;
                ret += this.int(i+1);
            }
        }
        ret += this._raw_values.join('');
        return ret;
    }

    static js2ron (val) {
        if (val===null || val===undefined) return ">0";
        switch (val.constructor) {
            case String: return JSON.stringify(val);
            case Number: return Number.isInteger(val) ? Op.INT_SEP+val : Op.FLOAT_SEP+val;
            case UID:    return Op.REF_SEP+val.toString();
            default:
                if (val===Op.FRAME_VALUE) return Op.FRAME_SEP;
                if (val===Op.QUERY_VALUE) return Op.QUERY_SEP;
                throw new Error("unsupported value type");
        }
    }
    
    static ron2js (str) {
        const mark = str[0], body = str.substr(1);
        switch (mark) {
            case Op.INT_SEP:        return parseInt(body);
            case Op.STRING_SEP:     return JSON.parse(str);
            case Op.REF_SEP:        return UID.fromString(body); // FIXME VV
            case Op.FLOAT_SEP:      return parseFloat(body);
            case Op.FRAME_SEP:      return Op.FRAME_VALUE;
            case Op.QUERY_SEP:      return Op.QUERY_VALUE;
            default:                throw new Error("not a RON value");
        }
    }

    static error (message) {
        return Op.fromUIDs([UID.ERROR, UID.ERROR, UID.ERROR, UID.ERROR], [message]);
    }

}

Op.FRAME_VALUE = Symbol("frame");
Op.QUERY_VALUE = Symbol("query");
Op.FRAME_SEP = "!";
Op.QUERY_SEP = "?";
Op.INT_SEP = '=';
Op.REF_SEP = '>';
Op.STRING_SEP = '"';
Op.FLOAT_SEP = '^';
Op.VALUE_SEPS = Op.INT_SEP + Op.STRING_SEP +
    Op.FLOAT_SEP + Op.REF_SEP + Op.FRAME_SEP + Op.QUERY_SEP;
Op.TYPE_UID_SEP = '.';
Op.OBJECT_UID_SEP = '#';
Op.EVENT_UID_SEP = '@';
Op.LOC_UID_SEP = ':';
Op.UID_SEPS = Op.TYPE_UID_SEP + Op.OBJECT_UID_SEP + Op.EVENT_UID_SEP + Op.LOC_UID_SEP;
Op.LEFT_REDEF_SEP = '\\';
Op.RIGHT_REDEF_SEP = '/';
Op.NO_REDEF_SEP = '|';
Op.REDEF_SEPS = Op.LEFT_REDEF_SEP + Op.NO_REDEF_SEP + Op.RIGHT_REDEF_SEP;
Op.PREFIX_SEPS = "([{}])";
Op.RS_ZIP_INT = "([.#@:\\-])?([\\\\/])?([([{}\\])])?([0-9A-Za-z_~]{0,10})";
Op.RS_INT_VALUE = Op.INT_SEP + '\\d+';
Op.RS_FLOAT_VALUE = '\\'+Op.FLOAT_SEP + '\\d+(?:\\.\\d+)?([eE][-+]?\\d+)?'
Op.RS_STRING_VALUE = '"(?:[^"]|\\\\")*"'.replace(/"/g, Op.STRING_SEP);
Op.RS_REF_VALUE = Op.REF_SEP + UID.RS_UID;
Op.RS_FRAME_VALUE = '\\' + Op.FRAME_SEP;
Op.RS_VALUE = '(' + [Op.RS_INT_VALUE, Op.RS_STRING_VALUE, Op.RS_REF_VALUE,
        Op.RS_FLOAT_VALUE, Op.RS_FRAME_VALUE, ''].join(')|(') + ')';
Op.RE_VALUE_G = new RegExp(Op.RS_VALUE, 'g');
Op.RS_OP = '(' + Op.RS_ZIP_INT + ')+(' + Op.RS_VALUE + ')+';
Op.RE_ZIP_INT_G = new RegExp(Op.RS_ZIP_INT, 'g');
Op.RE_OP_G = new RegExp(Op.RS_OP, 'g');

module.exports = Op;
