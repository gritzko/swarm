"use strict";
var Base64x64 = require('./Base64x64');
var Stamp = require('./Stamp');
var Spec = require('./Spec');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
export default class Op {

    constructor(int_strings, value_strings) {
        if (int_strings.length!==8)
            throw new Error("not an array of 8 Base64x64 ints");
        this._ints = int_strings;
        this._values = value_strings;
        // values should be passed around *verbatim*, so the
        // serialized form is the canonic form; parsed
        // values are platform/environment dependent.
        this._parsed_values = null;
    }

    fromString(op_string, default_ints) {
        // read in the tokens
        let int = null, val = null;
        const ints = this._ints;
        let int_at = 0;
        while (int = this.eat(Frame.re_uid)) {
            const quant = m[1], redef = m[2], prefix = m[3], tail = m[4];
            if (quant) {
                if (Frame.HALF_QUANTS.indexOf(quant) !== -1) {
                    int_at |= 1;
                } else {
                    const at = Frame.QUANTS.indexOf(quant) << 1;
                    if (at < int_at)
                        return this._terminate("uid order violation");
                    else
                        int_at = at;
                }
            }
            let def = ints[int_at];
            if (redef && int_at > 1) {
                let new_at = int_at;
                if (redef === '/')
                    new_at += 2;
                else if (redef === '\\')
                    new_at -= 2;
                if (new_at < 2) // wrap
                    new_at += 6;
                else if (new_at >= 8)
                    new_at -= 6;
                def = ints[new_at];
            }
            if (prefix) {
                const len = Frame.PREFIX_BRACKETS.indexOf(prefix) + 4;
                if (def.length > len)
                    def = def.substr(0, len);
                else while (def.length < len)
                    def += '0';
            }
            if (tail) {
                if (prefix)
                    ints[int_at] = (def + tail).substr(0, 10);
                else
                    ints[int_at] = tail;
            }
            int_at++;
        }

        if (!int_at)
            return this._terminate("trailing garbage");

        this._values.length = 0;
        const values = this._values;

        while (val = this.eat(Frame.re_value)) { // FIXME on-demand parsing
            const value = val[0];
            switch (value.charAt(0)) {
                case Frame.INT_SEP:
                    values.push(parseInt(value.substr(1)));
                    break;
                case Frame.STRING_SEP:
                    values.push(JSON.parse(value));
                    break;
                case Frame.REF_SEP:
                    values.push(null);
                    break;
                case Frame.FLOAT_SEP:
                    values.push(parseFloat(value.substr(1)));
                    break;
            }
        }

        if (!values.length)
            return this._terminate("no values");

        return new Op(int_strings, value_strings);

    }

    fromUIDs(uids, values) {

    }

}

module.exports = Op;
