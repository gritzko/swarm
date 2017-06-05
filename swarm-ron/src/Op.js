"use strict";
const RON_GRAMMAR = require("./Grammar");
const Base64x64 = require('./Base64x64');
const UUID = require('./UUID');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
class Op {

    constructor(type, object, event, location, value_strings) {
        this.type = UUID.as(type);
        this.object = UUID.as(object);
        this.event = UUID.as(event);
        this.location = UUID.as(location);
        this._raw_values = value_strings || ['?'];
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

    ints () {
        const ret = [];
        for(let i=0; i<8; i++)
            ret.push(this.int(i));
        return ret; // FIXME
    }

    raw_value (i) {
        return this._raw_values[i];
    }

    raw_values () {
        return this._raw_values;
    }

    int (i) {
        switch (i) {
            case 0: return this.type.time;
            case 1: return this.type.origin;
            case 2: return this.object.time;
            case 3: return this.object.origin;
            case 4: return this.event.time;
            case 5: return this.event.origin;
            case 6: return this.location.time;
            case 7: return this.location.origin;
        }
    }

    uuid (u) {
        switch(u) {
            case 0: return this.type;
            case 1: return this.object;
            case 2: return this.event;
            case 3: return this.location;
            default: throw new Error('no such uuid index');
        }
    }

    static fromString(op_string) {

        if (!op_string) return Op.ZERO;

        const parts = RON_GRAMMAR.split(op_string, "ZIP_OP");
        let prev = UUID.ZERO;
        return parts ? new Op(
            prev = parts[0] ? UUID.fromString(parts[0], parts[0][0]==='`'?prev:UUID.ZERO) : UUID.ZERO,
            prev = parts[1] ? UUID.fromString(parts[1], parts[1][0]==='`'?prev:UUID.ZERO) : UUID.ZERO,
            prev = parts[2] ? UUID.fromString(parts[2], parts[2][0]==='`'?prev:UUID.ZERO) : UUID.ZERO,
            prev = parts[3] ? UUID.fromString(parts[3], parts[3][0]==='`'?prev:UUID.ZERO) : UUID.ZERO,
            parts[4]
        ) : null;
    }

    static as (something) {
        if (!something) return Op.ZERO;
        if (something.constructor===Op) return something;
        return Op.fromString(something);
    }

    isState () {
        return this.value(0)===Op.FRAME_VALUE;
    }

    isQuery () {
        return this.value(0)===Op.QUERY_VALUE;
    }

    isError () {
        return this.event.eq(UUID.ERROR);
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
                ret += UUID.TIMESTAMP_SEPARATOR;
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
            case UUID:    return Op.REF_SEP+val.toString();
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
            case Op.REF_SEP:        return UUID.fromString(body); // FIXME VV
            case Op.FLOAT_SEP:      return parseFloat(body);
            case Op.FRAME_SEP:      return Op.FRAME_VALUE;
            case Op.QUERY_SEP:      return Op.QUERY_VALUE;
            default:                throw new Error("not a RON value");
        }
    }

    static error (message) {
        return Op.fromUIDs([UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR], [message]);
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
Op.RS_FLOAT_VALUE = '\\'+Op.FLOAT_SEP + '\\d+(?:\\.\\d+)?([eE][-+]?\\d+)?';
Op.RS_STRING_VALUE = '"(?:[^"]|\\\\")*"'.replace(/"/g, Op.STRING_SEP);
Op.RS_REF_VALUE = Op.REF_SEP + UUID.RS_UID;
Op.RS_FRAME_VALUE = '\\' + Op.FRAME_SEP;
Op.RS_VALUE = '(' + [Op.RS_INT_VALUE, Op.RS_STRING_VALUE, Op.RS_REF_VALUE,
        Op.RS_FLOAT_VALUE, Op.RS_FRAME_VALUE, ''].join(')|(') + ')';
Op.RE_VALUE_G = new RegExp(Op.RS_VALUE, 'g');
Op.RS_OP = '(' + Op.RS_ZIP_INT + ')+(' + Op.RS_VALUE + ')+';
Op.RE_ZIP_INT_G = new RegExp(Op.RS_ZIP_INT, 'g');
Op.RE_OP_G = new RegExp(Op.RS_OP, 'g');

Op.ZERO = new Op(UUID.ZERO, UUID.ZERO, UUID.ZERO, UUID.ZERO, Op.FRAME_VALUE);

module.exports = Op;
