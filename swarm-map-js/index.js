"use strict";
const RON = require('swarm-ron');
const UUID = require('swarm-ron-uuid');
const Op = RON.Op;
const Cursor = RON.Cursor;

/**
 *
 * @param raw_frame {Cursor}
 * @returns {Object|Array}
 */
function lwwFrame2js (raw_frame) {
    let rootID = null;
    const refs = {};
    const lww = Cursor.as(raw_frame);

    if (!lww.op) return 'null';

    while (lww.op) {
        rootID = rootID || lww.op.object.toString();
        if (lww.op.isHeader() || lww.op.isQuery()) {
            lww.nextOp();
            continue
        }
        const ref = refs[lww.op.object.toString()] || (refs[lww.op.object.toString()] = lww.op.location.isHash() ? [] : {});
        let value = Op.ron2js(lww.op.values).pop();
        if (value instanceof UUID) {
          value = {$ref: value.toString()};
        }

        let key = lww.op.location.toString();
        if (lww.op.location.isHash()) {
            if (lww.op.location.value !== '~') {
                throw new Error('only flatten arrays are beign supported');
            };
            key = parseInt(lww.op.location.origin);
            if (isNaN(key)) {
                throw new Error('malformed index value: ' + lww.op.location.origin);
            }
        }

        ref[key] = value;
        lww.nextOp()
    }

    Object.keys(refs).forEach(key => {
        const value = refs[key];
        if (Array.isArray(value)) {
            refs[key] = value.map(v => {
                if (isObject(v) && !!v['$ref']) {
                    return refs[v['$ref']] || v
                } else {
                    return v
                }
            })
        } else if (isObject(value)) {
            Object.keys(value).forEach(k => {
                if (isObject(value[k]) && !!value[k]['$ref']) {
                    refs[key][k] = refs[value[k]['$ref']] || value[k]
                }
            })
        } else {
            throw new Error("unexpected value");
        }
    })

    return Object.freeze(refs[rootID] || null);
}

function isObject(o) {
    return !!o && o.constructor === Object;
};

if (!RON.FN.MAP.js) RON.FN.MAP.js = {};
RON.FN.MAP.js.lww = lwwFrame2js;
module.exports = lwwFrame2js;
