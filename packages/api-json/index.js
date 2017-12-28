"use strict";
const UUID = require('swarm-ron-uuid');
const RON = require('swarm-ron');
const Op = RON.Op;
const Frame =RON.Frame;
const Cursor = Frame.Cursor;
const Stream = RON.Stream;

class JSONAPI extends Stream {
    /**
     * @param options {Object=}
     * @param upstream {Stream}
     */
    constructor (upstream, options) {
        super();
        /** @type {Stream} */
        this.upstream = upstream;
        // { id  : json_body }
        this.json = Object.create(null);
        // { id : [id] }
        this.refs = Object.create(null);
        // { query : stream }
        this.queries = Object.create(null);
    }
    // these object graphs can be enormous, we don't want them
    // in memory; may produce a specialized node.js impl using
    // Buffers, not strings
    // Also, may stream the data directly.

    expand (json_string) {
        // recursive, no cycles
    }

    /**
     *
     * @param data {Cursor}
     */
    update (data) {
        // parse remember frames
        // check all queries
    }

    /**
     *
     * @param query {Cursor}
     */
    on (query) {

    }

}

module.exports = JSONAPI;