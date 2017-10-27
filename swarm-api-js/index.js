"use strict";
const UUID = require('swarm-ron-uuid');
const Op = require('swarm-ron');
const Frame = Op.Frame;
const Iterator = Frame.Iterator;
const RDT = require('swarm-rdt');

/**
 * @param frame {String}
 * @return {String}
 */
function lww2json (frame) {
    let json_string = '{';
    const i=new Iterator(frame);
    const object = i.op.object;
    const version = i.op.version;
    for(; i.op; i.nextOp()) {
        json_string += '\\"' + i.op.location.value + '\\":';
        const v = Op.ron2js(i.op.value);
        json_string += v;
    }
    return new Frame(
        JSON_UUID,
        object,
        version,
        UUID.ZERO,
        json_string
    );
}

function vec2json (frame) {

}

const JSON_UUID = UUID.fromString('json');
RDT.lww.map.json = lww2json;

module.exports = RDT; // ?