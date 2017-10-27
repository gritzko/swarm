"use strict";
const RON = require('swarm-ron');
const UUID = require('swarm-ron-uuid');
const UUIDVector = UUID.Vector;
const Op = RON.Op;
const Frame = RON.Frame;
const Cursor = RON.Cursor;

/**
 *
 * @param value {String}
 * @param refs {UUIDVector}
 */
function ron2json (value, refs) {
    Op.VALUE_RE.lastIndex = 0;
    const m=Op.VALUE_RE.exec(value);
    let json_value = "null";
    if (m[1]) {
        return m[1];
    } else if (m[2]) {
        return m[2][0]==='"' ? m[2] : '"TODO"';//RON.flipQuotes(m[2]);
    } else if (m[3]) {
        return m[3];
    } else if (m[4]) {
        refs.push(m[4]);
        return '{"$ref":1}';
    }
}

function is_index (uuid) {

}

const BODY_UUID = UUID.fromString("body");
const REFS_UUID = UUID.fromString("refs");

function to_json_array (cur) {
    body = "'[";
    let index = 0;
    const i = lww.clone();
    while (i.op) {
        const loc = i.op.location;
        if (loc.origin!=='0' || parseInt(loc.value)!==index++) {
            body = null;
            refs = new UUIDVector();
            break;
        }
        body += ron2json(i.op.values, refs);
        if (i.nextOp())
            body += ',';
    }
    if (body!==null)
        body += "]'";
    return new Frame().push().push();
}

function to_json_object (cur) {
    body = "'{";
    const i = lww.clone();
    while ( i.op ) {
        body += '"';
        body += i.op.location.value;
        body += '":';
        body += ron2json(i.op.values, refs);
        if (i.nextOp())
            body += ',';
    }
    body += "}'";
}

/**
 *
 * @param raw_frame {Cursor}
 * @returns {Frame}
 */
function map_lww_json (raw_frame) {

    // omnivorous frame/ frame array? FIXME

    const ret = new Frame();
    const lww = Cursor.as(raw_frame);
    if (!lww.op)
        return ret;
    const object = lww.op.object;
    const event = lww.op.event;
    ret.push(new Op(JSON_UUID, object, event, UUID.ZERO, Op.FRAME_SEP));
    if (lww.op && lww.op.isHeader())
        lww.nextOp();
    let body = null;
    let refs = new UUIDVector();

    if (lww.op.location.isZero()) { // maybe an array
    }
    if (body===null) {
    }
    ret.push(new Op(JSON_UUID, object, event, BODY_UUID, body ));
    const ref = '>>' + refs.toString(ret.last.object);
    if (refs.body)
        ret.push(new Op(JSON_UUID, object, event, REFS_UUID, ref));
    return ret;
}

/**
 *
 * @param asm_frame {Cursor}
 * @param raw_frame {Cursor}
 */
function asm_json (asm_frame, raw_frame) {
    const json = asm_frame.op.stringValue(0);
    const fragments = Object.create(null);
    while (raw_frame.op) {
        fragments[raw_frame.op.object] = raw_frame.op.stringValue(0);
        raw_frame.nextOp();
    }
    function replace (template) {
        if () {
            ret += replace(fragmets[id]);
        } else {
            refs.push(id);
        }
    }
    const body = replace(json);
    // must return refs tooo
}


const JSON_UUID = UUID.fromString("json");
if (!RON.FN.MAP.json)
    RON.FN.MAP.json = Object.create(null);
RON.FN.MAP.json.lww = map_lww_json;
module.exports = map_lww_json;

// RDT.map.rga.json = function (frame) {
//
// };
