// @flow
'use strict';

import Grammar from 'swarm-ron-grammar';
import UUID, {ZERO as ZERO_UUID, ERROR, NEVER} from 'swarm-ron-uuid';
import type Stringer from './types';

export type JSON_VALUE_TYPE = string | number | boolean | null;

const TRUE_UUID = UUID.fromString('true');
const FALSE_UUID = UUID.fromString('false');
const NULL_UUID = UUID.fromString('0');

/** A RON op object. Typically, an Op is hosted in a frame.
 *  Frames are strings, so Op is sort of a Frame iterator.
 *  */
export default class Op {
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
  constructor(
    type: UUID,
    object: UUID,
    event: UUID,
    location: UUID,
    values: ?string,
    term: ?string,
  ) {
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

    this.term = term || ';';
    // @type {String}
    this.source = null; // FIXME remove
  }

  value(i: number) {
    if (!this.parsed_values) this.parsed_values = ron2js(this.values);
    return this.parsed_values[i];
  }

  isHeader(): boolean {
    return this.term === '!';
  }

  isQuery(): boolean {
    return this.term === '?';
  }

  isRegular(): boolean {
    return !this.isHeader() && !this.isQuery();
  }

  isError(): boolean {
    return this.event.value === ERROR.value;
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
        throw new Error('incorrect uuid index');
    }
  }

  key(): string {
    return '*' + this.type.value + '#' + this.object.value;
  }

  /**
   * @param ctxOp {Op}
   * @return {String}
   */
  toString(ctxOp: ?Op): string {
    let ret = '';
    const ctx = ctxOp || ZERO;
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
      ret += UUID_SEPS[u];
      ret += str;
    }
    ret += this.values;
    if (this.term != ';') {
      ret += this.term;
    }
    return ret;
  }

  // static RE: RegExp;
  // static VALUE_RE: RegExp;
  // static END: Op;
  // static PARSE_ERROR: Op;
  // static REDEF_SEPS: string;
  // static UUID_SEPS: string;
  // static INT_ATOM_SEP: string;
  // static FLOAT_ATOM_SEP: string;
  // static UUID_ATOM_SEP: string;
  // static FRAME_SEP: string;
  // static QUERY_SEP: string;
  // static FRAME_ATOM: Symbol;
  // static QUERY_ATOM: Symbol;
  //
  // static Frame: typeof Frame;
  // static Op: typeof Op;
  // static UUID: typeof UUID;
  // static reduce: (string, string) => string;
  // static FN: {
  //   // FIXME add type annotations
  //   RDT: {}, // reducers
  //   MAP: {}, // mappers
  //   API: {}, // API/assemblers
  //   IS: {|
  //     OP_BASED: 1,
  //     STATE_BASED: 2,
  //     PATCH_BASED: 4,
  //     VV_DIFF: 8,
  //     OMNIVOROUS: 16,
  //     IDEMPOTENT: 32,
  //   |},
  // };

  /**
   *
   * @param body {String} -- serialized frame
   * @param context {Op=} -- previous/context op
   * @param offset {Number=} -- frame body offset
   * @return {Op}
   */
  static fromString(body: string, context: ?Op, offset: ?number): ?Op {
    const ctx = context || ZERO;
    const off = offset || 0;
    RE.lastIndex = off;
    const m = RE.exec(body);
    if (!m || m[0] === '' || m.index !== off) return null;
    let prev = ZERO_UUID;
    const ret = new Op(
      UUID.fromString(m[1], ctx.type),
      UUID.fromString(m[2], ctx.object),
      UUID.fromString(m[3], ctx.event),
      UUID.fromString(m[4], ctx.location),
      m[5],
      m[6],
    );
    ret.source = m[0];
    return ret;
  }
}

/**
 * Flip quotes.
 * @param v {String} -- value
 * @return {String}
 */
export function flipQuotes(v: string): string {
  if (!v) return v;
  if (typeof v !== 'string') {
    throw new Error('unexpected type: ' + typeof v);
  }

  if (v[0] === '"') {
    return "'" + v.slice(1, -1) + "'";
  } else if (v[0] === "'") {
    return '"' + v.slice(1, -1) + '"';
  } else {
    throw new Error('malformed input');
  }
}

/**
 * Parse RON value atoms.
 * @param values {String} -- RON atoms
 * @return {Array} -- parsed values
 */
export function ron2js(values: string): Array<JSON_VALUE_TYPE | UUID> {
  VALUE_RE.lastIndex = 0;
  let m = null;
  const ret = [];

  while ((m = VALUE_RE.exec(values))) {
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
export function js2ron(values: Array<JSON_VALUE_TYPE | UUID>): string {
  const ret = values.map(v => {
    if (v === undefined) return UUID_ATOM_SEP + ZERO_UUID.toString();
    if (v === null) return UUID_ATOM_SEP + NULL_UUID.toString();

    switch (v.constructor) {
      case String:
        return flipQuotes(JSON.stringify(v));
      case Number:
        return Number.isInteger(v)
          ? INT_ATOM_SEP + v.toString()
          : FLOAT_ATOM_SEP + v.toString();
      case UUID:
        return UUID_ATOM_SEP + v.toString();
      case Boolean:
        return UUID_ATOM_SEP + (v ? TRUE_UUID : FALSE_UUID).toString();
      default:
        if (v === Op.FRAME_ATOM) return FRAME_SEP;
        if (v === Op.QUERY_ATOM) return QUERY_SEP;
        throw new Error('unsupported type');
    }
  });
  return ret.join('');
}

export const RE = new RegExp(Grammar.OP.source, 'g');
export const VALUE_RE = new RegExp(Grammar.ATOM, 'g');
export const ZERO = new Op(ZERO_UUID, ZERO_UUID, ZERO_UUID, ZERO_UUID, '>0');

export const END = new Op(ERROR, ERROR, ERROR, ERROR, '>~');
export const PARSE_ERROR = new Op(ERROR, ERROR, ERROR, ERROR, '>parseerror');
export const REDEF_SEPS = '`';
export const UUID_SEPS = '*#@:';
export const FRAME_ATOM = Symbol('FRAME');
export const QUERY_ATOM = Symbol('QUERY');
export const INT_ATOM_SEP = '=';
export const FLOAT_ATOM_SEP = '^';
export const UUID_ATOM_SEP = '>';
export const FRAME_SEP = '!';
export const QUERY_SEP = '?';

export class Frame {
  body: string;
  last: Op;

  constructor(str: ?Stringer) {
    this.body = str ? str.toString() : '';
    /** @type {Op} */
    this.last = ZERO;
  }

  /**
   * Append a new op to the frame
   * @param op {Op}
   */
  push(op: Op) {
    this.body += op.toString(this.last);
    this.last = op;
  }

  /*::  @@iterator(): Iterator<Op> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<Op> {
    return new Cursor(this.body);
  }

  toString() {
    return this.body;
  }

}
/**
 * Substitute UUIDs in all of the frame's ops.
 * Typically used for macro expansion.
 * @param rawFrame - {String}
 * @param fn {Function} - the substituting function
 */
export function mapUUIDs(rawFrame: string, fn: (UUID, number) => UUID): string {
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
      ),
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
export function slice(from: Cursor, till: Cursor): string {
  if (!from.op) return '';
  if (from.body !== till.body)
    throw new Error('iterators of different frames');
  let ret = from.op.toString();
  ret += from.body.substring(
    from.offset + from.length,
    till.op ? till.offset : undefined,
  );
  return ret;
}

export class Cursor {
  body: string;
  offset: number;
  length: number;
  op: ?Op;

  constructor(body: ?Stringer) {
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
        this.length = this.op.source.length;
      }
    }
    return this.op;
  }

  /*::  @@iterator(): Iterator<Op> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<Op> {
    return this;
  }

  next(): IteratorResult<Op, void> {
    const ret = this.op;
    if (ret) {
      this.nextOp();
      return { done: false, value: ret }
    } else {
      return { done: true }
    }
  }

  /** @param i {Frame|Cursor|String}
   *  @return {Cursor} */
  static as(i: Frame | Cursor | string): Cursor {
    if (i instanceof Cursor) return i;
    return i ? new Cursor(i.toString()) : new Cursor('');
  }
}

/** A stream of frames. It is always a subset or a projection of
 * the log. The "upstream" direction goes to the full op log.
 * "Downstream" means "towards the clients".
 * Writes are pushed upstream, updates are forwarded downstream. */
export class Stream {
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
  on(query: Cursor, stream: ?Stream) {}

  /**
   * Unsubscribe
   * @param query {Cursor}
   * @param stream {Stream}
   */
  off(query: Cursor, stream: ?Stream) {}

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
      op.event.eq(NEVER) ? this.off(i) : this.on(i);
    } else {
      this.push(i);
    }
  }

  /**
   * Receive a new update (frame)
   * @param frame {Cursor}
   * @param source {Stream}
   */
  update(frame: Cursor, source: ?Cursor): Stream {
    // TODO
    return new Stream();
  }

  /** @param frame {String} */
  recv(frame: Stringer) {
    this.update(Cursor.as(frame));
  }
}

export {default as UUID} from 'swarm-ron-uuid';
export { ERROR as UUID_ERROR } from 'swarm-ron-uuid';
