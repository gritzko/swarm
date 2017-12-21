// @flow
"use strict";

const Grammar = require("swarm-ron-grammar");
const UUID = require("swarm-ron-uuid");

const TRUE_UUID = UUID.fromString("true");
const FALSE_UUID = UUID.fromString("false");
const NULL_UUID = UUID.fromString("0");

import type Stringer from './types';

type JSON_VALUE_TYPE = string | number | boolean | null;

/** A RON op object. Typically, an Op is hosted in a frame.
 *  Frames are strings, so Op is sort of a Frame iterator.
 *  */
class Op {

  type: UUID;
  object: UUID;
  event: UUID;
  location: UUID;

  values: string;
  parsed_values: Array<JSON_VALUE_TYPE | UUID> | void;

  term: string;
  source: ?string;

  /**
   * A trusted Op constructor
   * @param type {UUID}
   * @param object {UUID}
   * @param event {UUID}
   * @param location {UUID}
   * @param values {String}
   */
  constructor(type: UUID, object: UUID, event: UUID, location: UUID, values?: string, term? : ?string) {
    /** @type {UUID} */
    this.type = type;
    /** @type {UUID} */
    this.object = object;
    /** @type {UUID} */
    this.event = event;
    /** @type {UUID} */
    this.location = location;
    /** @type {String} */
    this.values = values || '';
    // @type {Array}
    this.parsed_values = undefined;

    this.term = term || ";";
    // @type {String}
    this.source = null; // FIXME remove
  }

  value(i: number) {
    if (!this.parsed_values) this.parsed_values = Op.ron2js(this.values);
    return this.parsed_values[i];
  }

  isHeader(): boolean {
    return this.term === "!";
  }

  isQuery(): boolean {
    return this.term === "?";
  }

  isRegular(): boolean {
    return !this.isHeader() && !this.isQuery();
  }

  isError(): boolean {
    return this.event.value === UUID.ERROR.value;
  }

  /**
   *
   * @param body {String} -- serialized frame
   * @param context {Op=} -- previous/context op
   * @param offset {Number=} -- frame body offset
   * @return {Op}
   */
  static fromString(body: string, context?: ?Op, offset?: number): ?Op {
    const ctx = context || Op.ZERO;
    const off = offset || 0;
    Op.RE.lastIndex = off;
    const m = Op.RE.exec(body);
    if (!m || m[0] === "" || m.index !== off) return null;
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
  uuid(i: number): UUID {
    switch (i) {
      case 0:
        return this.type;
      case 1:
        return this.object;
      case 2:
        return this.event;
      case 3:
        return this.location;
      default:
        throw new Error("incorrect uuid index");
    }
  }

  key(): string {
    return "*" + this.type.value + "#" + this.object.value;
  }

  /**
   * @param context_op {Op}
   * @return {String}
   */
  toString(context_op: Op) {
    let ret = "";
    const ctx = context_op || Op.ZERO;
    for (let u = 0; u < 4; u++) {
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
    if (this.term != ";") {
      ret += this.term;
    }
    return ret;
  }

  /**
   * Flip quotes.
   * @param v {String} -- value
   * @return {String}
   */
  static flipQuotes(v: string): string {
    if (!v) return v;
    if (typeof v !== "string") {
      throw new Error("unexpected type: " + typeof v);
    }

    if (v[0] === '"') {
      return "'" + v.slice(1, -1) + "'";
    } else if (v[0] === "'") {
      return '"' + v.slice(1, -1) + '"';
    } else {
      throw new Error("malformed input");
    }
  }

  /**
   * Parse RON value atoms.
   * @param values {String} -- RON atoms
   * @return {Array} -- parsed values
   */
  static ron2js(values: string): Array<JSON_VALUE_TYPE | UUID> {
    Op.VALUE_RE.lastIndex = 0;
    let m = null;
    const ret = [];

    while ((m = Op.VALUE_RE.exec(values))) {
      if (m[1]) {
        ret.push(parseInt(m[1]));
      } else if (m[2]) {
        ret.push(JSON.parse('"' + m[2] + '"')); // VALUE_RE returns match w/o single quotes
      } else if (m[3]) {
        ret.push(parseFloat(m[3]));
      } else if (m[4]) {
        switch (m[4]) {
          case TRUE_UUID.value:
            ret.push(true);
            break;
          case FALSE_UUID.value:
            ret.push(false);
            break;
          case NULL_UUID.value:
            ret.push(null);
            break;
          default:
            ret.push(UUID.fromString(m[4]));
        }
      }
    }
    return ret;
  }

  /**
   * Serialize JS primitives into RON atoms.
   * @param values {Array} -- up to 8 js primitives
   * @return {String} -- RON atoms serialized
   */
  static js2ron(values: Array<JSON_VALUE_TYPE>): string {
    const ret = values.map(v => {
      if (v === undefined) return Op.UUID_ATOM_SEP + UUID.ZERO.toString();
      if (v === null) return Op.UUID_ATOM_SEP + NULL_UUID.toString();

      switch (v.constructor) {
        case String:
          return Op.flipQuotes(JSON.stringify(v));
        case Number:
          return Number.isInteger(v)
            ? Op.INT_ATOM_SEP + v.toString()
            : Op.FLOAT_ATOM_SEP + v.toString();
        case UUID:
          return Op.UUID_ATOM_SEP + v.toString();
        case Boolean:
          return Op.UUID_ATOM_SEP + (v ? TRUE_UUID : FALSE_UUID).toString();
        default:
          if (v === Op.FRAME_ATOM) return Op.FRAME_SEP;
          if (v === Op.QUERY_ATOM) return Op.QUERY_SEP;
          throw new Error("unsupported type");
      }
    });
    return ret.join("");
  }


  static RE: RegExp;
  static VALUE_RE: RegExp;
  static ZERO: Op;
  static END: Op;
  static PARSE_ERROR: Op;
  static REDEF_SEPS: string;
  static UUID_SEPS: string;
  static INT_ATOM_SEP: string;
  static FLOAT_ATOM_SEP: string;
  static UUID_ATOM_SEP: string;
  static FRAME_SEP: string;
  static QUERY_SEP: string;
  static FRAME_ATOM: Symbol;
  static QUERY_ATOM: Symbol;

  static Frame: typeof Frame;
  static Op: typeof Op;
  static Stream: typeof Stream;
  static Cursor: typeof Cursor;
  static UUID: typeof UUID;
  static reduce: (string, string) => string;
  static FN: {
    // FIXME add type annotations
    RDT: {}, // reducers
    MAP: {}, // mappers
    API: {}, // API/assemblers
    IS: {|
      OP_BASED: 1,
      STATE_BASED: 2,
      PATCH_BASED: 4,
      VV_DIFF: 8,
      OMNIVOROUS: 16,
      IDEMPOTENT: 32
    |},
  };
}

Op.RE = new RegExp(Grammar.OP.source, "g");
Op.VALUE_RE = new RegExp(Grammar.ATOM, "g");
Op.ZERO = new Op(UUID.ZERO, UUID.ZERO, UUID.ZERO, UUID.ZERO, ">0");
Op.END = new Op(UUID.ERROR, UUID.ERROR, UUID.ERROR, UUID.ERROR, ">~");
Op.PARSE_ERROR = new Op(
  UUID.ERROR,
  UUID.ERROR,
  UUID.ERROR,
  UUID.ERROR,
  ">parseerror"
);
Op.REDEF_SEPS = "`";
Op.UUID_SEPS = "*#@:";
Op.FRAME_ATOM = Symbol("FRAME");
Op.QUERY_ATOM = Symbol("QUERY");
Op.INT_ATOM_SEP = "=";
Op.FLOAT_ATOM_SEP = "^";
Op.UUID_ATOM_SEP = ">";
Op.FRAME_SEP = "!";
Op.QUERY_SEP = "?";

class Frame {
  body: string;
  last: Op;

  constructor(str?: ?Stringer) {
    this.body = str ? str.toString() : "";
    /** @type {Op} */
    this.last = Op.ZERO;
  }

  /**
   * Append a new op to the frame
   * @param op {Op}
   */
  push(op: Op) {
    this.body += op.toString(this.last);
    this.last = op;
  }

  // $FlowFixMe
  [Symbol.iterator]() {
    return new Cursor(this.body);
  }

  toString() {
    return this.body;
  }

  /**
   * Substitute UUIDs in all of the frame's ops.
   * Typically used for macro expansion.
   * @param rawFrame - {String}
   * @param fn {Function} - the substituting function
   */
  static mapUUIDs(rawFrame: string, fn: (UUID, number) => UUID): string {
    const ret = new Frame();
    for (const i = new Cursor(rawFrame); i.op; i.nextOp()) {
      const op = i.op;
      ret.push(
        new Op(
          fn(op.type, 0) || op.type,
          fn(op.object, 1) || op.object,
          fn(op.event, 2) || op.event,
          fn(op.location, 3) || op.location,
          op.values,
        )
      );
    }
    return ret.toString();
  }

  /**
   * Crop a frame, i.e. make a new [from,till) frame
   * @param from {Cursor} -- first op of the new frame
   * @param till {Cursor} -- end the frame before this op
   * @return {String}
   */
  static slice(from, till) {
    if (!from.op) return "";
    if (from.body !== till.body)
      throw new Error("iterators of different frames");
    let ret = from.op.toString();
    ret += from.body.substring(
      from.offset + from.length,
      till.op ? till.offset : undefined
    );
    return ret;
  }

  static Iterator: typeof Cursor;
  static Cursor: typeof Cursor;
}

class Cursor {
  body: string;
  offset: number;
  length: number;
  op: ?Op;

  constructor(body?: ?Stringer) {
    this.body = body ? body.toString() : "";
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
  clone(): Cursor {
    const ret = new Cursor(this.body);
    ret.offset = this.offset;
    ret.length = this.length;
    ret.op = this.op;
    return ret;
  }

  nextOp(): ?Op {
    this.offset += this.length;
    if (this.offset === this.body.length) {
      this.op = null;
      this.length = 1;
    } else {
      this.op = Op.fromString(this.body, this.op, this.offset);
      if (this.op !== null && this.op && this.op.source) {
        this.length = this.op.source.length
      };
    }
    return this.op;
  }

  next(): { value: ?Op, done: boolean } {
    const ret = this.op;
    if (ret) this.nextOp();
    return {
      value: ret,
      done: ret === null
    };
  }

  /** @param i {Frame|Cursor|String}
   *  @return {Cursor} */
  static as(i: Frame | Cursor | {toString: () => string}): Cursor {
    if (i instanceof Cursor) return i;
    return i ? new Cursor(i.toString()) : new Cursor('');
  }
}

/** A stream of frames. It is always a subset or a projection of
 * the log. The "upstream" direction goes to the full op log.
 * "Downstream" means "towards the clients".
 * Writes are pushed upstream, updates are forwarded downstream. */
class Stream {
  upstream: ?Stream;

  constructor(upstream: ?Stream) {
    this.upstream = null;
    if (upstream) this.connect(upstream);
  }

  /**
   * Set the upstream.
   * @param upstream {Stream}
   */
  connect(upstream: ?Stream) {
    this.upstream = upstream || null;
  }

  /**
   * @returns {boolean}
   */
  isConnected(): boolean {
    return this.upstream !== null;
  }

  /**
   * Subscribe to updates.
   * @param query {Cursor}
   * @param stream {Stream}
   */
  on(query: Cursor, stream?: Stream) {}

  /**
   * Unsubscribe
   * @param query {Cursor}
   * @param stream {Stream}
   */
  off(query: Cursor, stream?: Stream) {}

  /**
   * Push a new op/frame to the log.
   * @param frame {Cursor}
   */
  push(frame: Cursor) {}

  /** @param frame {String} */
  write(frame: Stringer) {
    const i = Cursor.as(frame);
    const op = i.op;
    if (!op) {
    } else if (op.isQuery()) {
      // FIXME
      op.event.eq(UUID.NEVER) ? this.off(i) : this.on(i);
    } else {
      this.push(i);
    }
  }

  /**
   * Receive a new update (frame)
   * @param frame {Cursor}
   * @param source {Stream}
   */
  update(frame, source) {}

  /** @param frame {String} */
  recv(frame: Stringer) {
    this.update(Cursor.as(frame));
  }
}

/***
 *
 * @param oldStateFrame {String}
 * @param changeFrame {String}
 * @return {String}
 */
function genericReduce(oldStateFrame: string, changeFrame: string): string {
  const oi = new Cursor(oldStateFrame);
  const ai = new Cursor(changeFrame);
  const reduce = RON.FN.RDT[oi.op.type];
  let error;
  const features = reduce && reduce.IS;
  if (!reduce) {
    error = ">NOTYPE";
  } else if (oi.op.isQuery() || ai.op.isQuery()) {
    error = ">NOQUERY";
  } else if (
    0 === (features & RON.FN.IS.OP_BASED) &&
    (oi.op.isRegular() || ai.op.isRegular())
  ) {
    error = ">NOOPBASED";
  } else if (0 === (features & RON.FN.IS.STATE_BASED) && ai.op.isHeader()) {
    error = ">NOSTATBASD";
  } else if (
    0 === (features & RON.FN.IS.OMNIVOROUS) &&
    !oi.op.type.eq(ai.op.type)
  ) {
    error = ">NOOMNIVORS";
  } else if (ai.op.isError()) {
    error = ">ERROR"; // TODO fetch msg
  }
  const newFrame = new Op.Frame();
  if (!error) {
    newFrame.push(
      new Op(
        oi.op.type,
        oi.op.object,
        ai.op.event,
        oi.op.isHeader() ? oi.op.location : oi.op.event,
        Op.FRAME_SEP
      )
    );
    reduce(oi, ai, newFrame);
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
    return newFrame.toString();
  }
}

Frame.Iterator = Cursor;
Frame.Cursor = Cursor;
const RON = (module.exports = Op); // TODO phase out
RON.Frame = Frame;
RON.Op = Op;
RON.Stream = Stream;
RON.Cursor = Cursor;
RON.UUID = UUID;
RON.reduce = genericReduce;

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
  }
};

// e.g. RON.FN.MAP.json.lww
// RON.FN.REDUCE.lww
// RON.FN.API.json
// RON.FN.RDT.lww.IS & RON.FN.IS.OP_BASED
