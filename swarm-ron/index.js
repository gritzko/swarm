"use strict";
const Grammar = require('swarm-ron-grammar');
const UUID = require('swarm-ron-uuid');

/** A RON op object. Typically, an Op is hosted in a frame.
 *  Frames are strings, so Op is sort of a Frame iterator.
 *  */
class Op {

    /**
     * A trusted Op constructor
     * @param type {UUID}
     * @param object {UUID}
     * @param event {UUID}
     * @param location {UUID}
     * @param values {String}
     */
    constructor (type, object, event, location, values, term) {
        /** @type {UUID} */
        this.type = type;
        /** @type {UUID} */
        this.object = object;
        /** @type {UUID} */
        this.event = event;
        /** @type {UUID} */
        this.location = location;
        /** @type {String} */
        this.values = values;
        // @type {Array}
        this.parsed_values = undefined;

        this.term = term || ';';
        // @type {String}
        this.source = null; // FIXME remove
    }

    value (i) {
        if (!this.parsed_values)
            this.parsed_values = Op.ron2js(this.values);
        return this.parsed_values[i];
    }

    isHeader () {
        return this.values===Op.FRAME_SEP || this.value(0)===Op.FRAME_ATOM;
    }

    isQuery () {
        return this.values===Op.QUERY_SEP || this.value(0)===Op.QUERY_ATOM;
    }

    isRegular () {
        return !this.isHeader() && !this.isQuery();
    }

    isError () {
        return this.event.value===UUID.ERROR.value;
    } 

    /**
     *
     * @param body {String} -- serialized frame
     * @param context {Op=} -- previous/context op
     * @param offset {Number=} -- frame body offset
     * @return {Op}
     */
    static fromString (body, context, offset) {
        const ctx = context || Op.ZERO;
        const off = offset || 0;
        Op.RE.lastIndex = off;
        const m = Op.RE.exec(body);
        if (!m || m.index!==off)
            return null;
        let prev = UUID.ZERO;
        const ret = new Op(
            UUID.fromString(m[1], ctx.type),
            UUID.fromString(m[2], ctx.object),
            UUID.fromString(m[3], ctx.event),
            UUID.fromString(m[4], ctx.location),
            m[5],
            m[6]
        );
        ret.source = m[0];
        return ret;
    }

    /** Get op UUID by index (0-3)
     * @return {UUID} */
    uuid (i) {
        switch (i) {
            case 0: return this.type;
            case 1: return this.object;
            case 2: return this.event;
            case 3: return this.location;
            default: throw new Error('incorrect uuid index');
        }
    }

    key () {
        return '*'+this.type+'#'+this.object;
    }

    /**
     * @param context_op {Op}
     * @return {String}
     */
    toString (context_op) {
        let ret = '';
        const ctx = context_op || Op.ZERO;
        for(let u=0; u<4; u++) {
            const uuid = this.uuid(u);
            const same = ctx.uuid(u);
            if (uuid.eq(same)) continue;
            let str = uuid.toString(same);
            /*if (u) for(let d=0; d<4 && str.length>1; d++) if (d!==u) {
                const def = d ? ctx.uuid(d) : this.uuid(u-1);
                const restr = Op.REDEF_SEPS[d] + uuid.toString(def);
                if (restr.length<str.length)
                    str = restr;
            }*/
            ret += Op.UUID_SEPS[u];
            ret += str;
        }
        ret += this.values;
        if (this.term!=';') {
            ret += this.term;
        }
        return ret;
    }


    /**
     * Parse RON value atoms.
     * @param values {String} -- RON atoms
     * @return {Array} -- parsed values
     */
    static ron2js (values) {
        Op.VALUE_RE.lastIndex = 0;
        let m = null, ret = [];
        while (m=Op.VALUE_RE.exec(values)) {
            if (m[1]) {
                ret.push(parseInt(m[1]));
            } else if (m[2]) {
                ret.push(JSON.parse(m[2]));
            } else if (m[3]) {
                ret.push(parseFloat(m[3]));
            } else if (m[4]) {
                ret.push(UUID.fromString(m[4]));
            } else if (m[5]) {
                ret.push(Op.FRAME_ATOM);
            } else if (m[6]) {
                ret.push(Op.QUERY_ATOM);
            }
        }
        return ret;
    }

    /**
     * Serialize JS primitives into RON atoms.
     * @param values {Array} -- up to 8 js primitives
     * @return {String} -- RON atoms serialized
     */
    static js2ron (values) {
        const ret = values.map( v => {
            if (!v) return Op.UUID_ATOM_SEP + UUID.ZERO.toString();
            switch (v.constructor) {
                case String: return JSON.stringify(v);
                case Number: return Number.isInteger(v) ?
                    Op.INT_ATOM_SEP + v : Op.FLOAT_ATOM_SEP + v;
                case UUID: return Op.UUID_ATOM_SEP + v.toString();
                default:
                    if (v===Op.FRAME_ATOM) return Op.FRAME_SEP;
                    if (v===Op.QUERY_ATOM) return Op.QUERY_SEP;
                    throw new Error("unsupported type");
            }
        });
        return ret.join('');
    }

}

Op.RE = new RegExp(Grammar.OP.source, 'g');
Op.VALUE_RE = new RegExp(Grammar.ATOM, 'g');
Op.ZERO = new Op(UUID.ZERO,UUID.ZERO,UUID.ZERO,UUID.ZERO,">0");
Op.END = new Op(UUID.ERROR,UUID.ERROR,UUID.ERROR,UUID.ERROR,'>~');
Op.PARSE_ERROR = new Op
    (UUID.ERROR,UUID.ERROR,UUID.ERROR,UUID.ERROR,'>parseerror');
Op.REDEF_SEPS = "`";
Op.UUID_SEPS = "*#@:";
Op.FRAME_ATOM = Symbol("FRAME");
Op.QUERY_ATOM = Symbol("QUERY");
Op.INT_ATOM_SEP = '=';
Op.FLOAT_ATOM_SEP = '^';
Op.UUID_ATOM_SEP = '>';
Op.FRAME_SEP = '!';
Op.QUERY_SEP = '?';

class Frame {
    
    constructor (string) {
        this.body = string ? string.toString() : '';
        /** @type {Op} */
        this.last = Op.ZERO;
    }

    /**
     * Append a new op to the frame
     * @param op {Op}
     */
    push (op) {
        this.body += op.toString(this.last);
        this.last = op;
    }

    [Symbol.iterator]() {
        return new Cursor (this.body);
    }
    
    toString () {
        return this.body;
    }

    /**
     * Substitute UUIDs in all of the frame's ops.
     * Typically used for macro expansion.
     * @param raw_frame - {String}
     * @param fn {Function} - the substituting function
     */
    static map_uuids (raw_frame, fn) {
        const ret = new Frame();
        for(const i=new Cursor(raw_frame); i.op; i.nextOp())
            ret.push(new Op(
                fn(i.op.type,0) || i.op.type,
                fn(i.op.object,1) || i.op.object,
                fn(i.op.event,2) || i.op.event,
                fn(i.op.location,3) || i.op.location,
                i.op.values
            ));
        return ret.toString();
    }

    /**
     * Crop a frame, i.e. make a new [from,till) frame
     * @param from {Cursor} -- first op of the new frame
     * @param till {Cursor} -- end the frame before this op
     * @return {String}
     */
    static slice (from, till) {
        if (!from.op) return '';
        if (from.body!==till.body)
            throw new Error("iterators of different frames");
        let ret = from.op.toString();
        ret += from.body.substring(
            from.offset+from.length,
            till.op ? till.offset : undefined
        );
        return ret;
    }
    
}

class Cursor {

    constructor (body) {
        this.body = body ? body.toString() : '';
        this.offset = 0;
        this.length = 0;
        /** @type {Op} */
        this.op = this.nextOp();
    }

    toString() {
        return this.body;
    }

    /**
     * @return {Cursor}
     */
    clone () {
        const ret = new Cursor(this.body);
        ret.offset = this.offset;
        ret.length = this.length;
        ret.op = this.op;
        return ret;
    }

    nextOp () {
        this.offset += this.length;
        if (this.offset===this.body.length) {
            this.op = null;
            this.length = 1;
        } else {
            this.op = Op.fromString(this.body, this.op, this.offset);
            if (this.op !== null)
                this.length = this.op.source.length;
        }
        return this.op;
    }

    next () {
        const ret = this.op;
        if (ret) this.nextOp();
        return {
            value: ret,
            done: ret===null
        }
    }

    /** @param i {Frame|Cursor|String}
     *  @return {Cursor} */
    static as (i) {
        if (i&&i.constructor===Cursor) return i;
        return new Cursor(i.toString());
    }
    
}

/** A stream of frames. It is always a subset or a projection of
 * the log. The "upstream" direction goes to the full op log.
 * "Downstream" means "towards the clients".
 * Writes are pushed upstream, updates are forwarded downstream. */
class Stream {

    constructor (upstream) {
        this.upstream = null;
        if (upstream)
            this.connect(upstream);
    }

    /**
     * Set the upstream.
     * @param upstream {Stream}
     */
    connect (upstream) {
        this.upstream = upstream || null;
    }

    /**
     * @returns {boolean}
     */
    isConnected () {
        return this.upstream !== null;
    }

    /**
     * Subscribe to updates.
     * @param query {Cursor}
     * @param stream {Stream}
     */
    on (query, stream) {
    }

    /**
     * Unsubscribe
     * @param query {Cursor}
     * @param stream {Stream}
     */
    off (query, stream) {
    }

    /**
     * Push a new op/frame to the log.
     * @param frame {Cursor}
     */
    push (frame) {
    }

    /** @param frame {String} */
    write (frame) {
        const i = Cursor.as(frame);
        if (!i.op) {
        } else if (i.op.isQuery()) {
            // FIXME
            i.op.event.eq(UUID.NEVER) ? this.off(i) : this.on(i);
        } else {
            this.push(i);
        }
    }

    /**
     * Receive a new update (frame)
     * @param frame {Cursor}
     * @param source {Stream}
     */
    update (frame, source) {
    }

    /** @param frame {String} */
    recv (frame) {
        this.update(Cursor.as(frame));
    }

}


/***
 *
 * @param old_state_frame {String}
 * @param change_frame {String}
 * @return {String}
 */
function generic_reduce (old_state_frame, change_frame) {
    const oi = new Cursor(old_state_frame);
    const ai = new Cursor(change_frame);
    const reduce = RON.FN.RDT[oi.op.type];
    let error;
    const features = reduce&&reduce.IS;
    if (!reduce) {
        error = ">NOTYPE";
    } else if (oi.op.isQuery() || ai.op.isQuery()) {
        error = ">NOQUERY";
    } else if (0===(features&RON.FN.IS.OP_BASED) && (oi.op.isRegular() || ai.op.isRegular())) {
        error = ">NOOPBASED";
    } else if (0===(features&RON.FN.IS.STATE_BASED) && ai.op.isHeader()) {
        error = ">NOSTATBASD";
    } else if (0===(features&RON.FN.IS.OMNIVOROUS) && !oi.op.type.eq(ai.op.type)) {
        error = ">NOOMNIVORS";
    } else if (ai.op.isError()) {
        error = ">ERROR"; // TODO fetch msg
    }
    const new_frame = new Op.Frame();
    if (!error) {
        new_frame.push( new Op(
            oi.op.type,
            oi.op.object,
            ai.op.event,
            oi.op.isHeader() ? oi.op.location : oi.op.event,
            Op.FRAME_SEP
        ) );
        reduce(oi, ai, new_frame);
    }
    if (error) {
        return new Op(
            oi.op.type,
            oi.op.object,
            UUID.ERROR,
            ai.op.event,
            error
        ).toString();
    } else {
        return new_frame.toString();
    }
}



Frame.Iterator = Cursor;
Frame.Cursor = Cursor;
const RON = module.exports = Op; // TODO phase out
RON.Frame = Frame;
RON.Op = Op;
RON.Stream = Stream;
RON.Cursor = Cursor;
RON.UUID = UUID;
RON.reduce = generic_reduce;

RON.FN = {
    RDT: {}, // reducers
    MAP: {}, // mappers
    API: {}, // API/assemblers
    IS: {
        OP_BASED: 1,
        STATE_BASED: 2,
        PATCH_BASED: 4,
        VV_DIFF: 8,
        OMNIVOROUS: 16,
        IDEMPOTENT: 32,
    },
};
// e.g. RON.FN.MAP.json.lww
// RON.FN.REDUCE.lww
// RON.FN.API.json
// RON.FN.RDT.lww.IS & RON.FN.IS.OP_BASED
