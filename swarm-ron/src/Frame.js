"use strict";
const Base =require("./Base64x64");
const RON_GRAMMAR = require("./Grammar");
const UUID = require("./UUID");
const Op = require("./Op");

class Frame {

    constructor (body, mode) {
        this._body = body || '';
        this._last_op = Op.ZERO;
        mode = mode || (Frame.ZIP_OPTIONS.VARLEN|Frame.ZIP_OPTIONS.SKIPTOK|Frame.ZIP_OPTIONS.PREFIX);
        this._options = {
            varlen: 0!==(mode & Frame.ZIP_OPTIONS.VARLEN),
            skipquant: 0!==(mode & Frame.ZIP_OPTIONS.SKIPQUANT),
            prefix: 0!==(mode & Frame.ZIP_OPTIONS.PREFIX),
            skiptok: (0!==(mode & Frame.ZIP_OPTIONS.SKIPTOK)), // || (o_prefix&&o_skipquant),
            spaceops: 0!==(mode & Frame.ZIP_OPTIONS.SPACEOPS),
            redefault: 0!==(mode & Frame.ZIP_OPTIONS.REDEFAULT)
        };
    }

    push (new_op) {
        const op = Op.as(new_op);

        //
        // if (opts.spaceops && this._body.length) {
        //     buf += ' ';
        // }

        this._body += op.toZipString(this._last_op);

        this._last_op = op;
    }

    pushAll (i) {
        for(let op of i)
            this.push(Op.as(op));
    }

    [Symbol.iterator]() {
        return new Frame.Iterator (this._body);
    }

    static fromString (body) {
        return new Frame(body);
    }

    static fromArray (arr) {
        const ret = new Frame();
        arr.forEach( f => ret.pushAll(Frame.as(f)) );
        return ret;
    }

    static as (frame) {
        if (!frame) return new Frame();
        if (frame.constructor===Frame) return frame;
        if (frame.constructor===Array) return Frame.fromArray(frame);
        return Frame.fromString(frame.toString());
    }

    toString () {
        return this._body;
    }

}

Frame.RE_WSP = /[\s\t]*/g;
Frame.re_terminators = /\n*/g;

Frame.ZIP_OPTIONS = {
    VARLEN: 1,
    SKIPQUANT: 2,
    PREFIX: 4,
    SKIPTOK: 8,
    SPACEOPS: 32,
    REDEFAULT: 16,
    ALLSET: 31
};

class Iterator {

    constructor (body) {
        this._body = body.toString();
        this.op = Op.ZERO;
        this._offset = 0;
        this._index = -1;
        this.nextOp();
    }

    static as (something) {
        if (!something) return new Iterator('');
        if (something.constructor===Iterator) return something;
        return new Iterator(something.toString());
    }

    end () {
        return this.op.isError();
    }

    nextOp () {

        if ( this._offset===this._body.length ) {
            this.op = Iterator.ERROR_END_OP;
            return;
        }

	let off = { offset: this._offset }
	let op = Op.fromZipString(this._body, this.op, off);
	if (!op) {
	    this.op = Iterator.ERROR_BAD_OP;
            return;
        }
	this._offset = off.offset;
	this.op = op;
        this._index++;
        // FIXME sanity checks
        return this.op;
    }

    nextFrame () {
        const at = this.op;
        const from = this._offset;
        let till = from;
        do {
            till = this._offset;
            this.nextOp();
        } while(this.op.object.eq(at.object));
        const ret = at.toString() + this._body.substring(from, till);
        return ret;
    }

    next () {
        const ret = {
            done: this.op.isError(),
            value: this.op
        };
        if (!ret.done)
            this.nextOp();
        return ret;
    }

}
Frame.Iterator = Frame.Iterator = Iterator;
Iterator.ERROR_END_OP = new Op(UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR, "END");
Iterator.ERROR_BAD_OP = new Op(UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR, "BAD SYNTAX");


module.exports = Frame;
