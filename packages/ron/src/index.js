// @flow
'use strict';

import Grammar from '@swarm/ron-grammar';
import UUID, { ZERO as ZERO_UUID, ERROR, COMMENT } from '@swarm/ron-uuid';

export { default as UUID } from '@swarm/ron-uuid';
export { ERROR as UUID_ERROR } from '@swarm/ron-uuid';
export { default as Batch } from './batch';
import Batch from './batch';

export type Atom = string | number | boolean | null | UUID;

const TRUE_UUID = UUID.fromString('true');
const FALSE_UUID = UUID.fromString('false');
const NULL_UUID = UUID.fromString('0');

// A RON op object. Typically, an Op is hosted in a frame.
// Frames are strings, so Op is sort of a Frame iterator.
export default class Op {
  type: UUID;
  object: UUID;
  event: UUID;
  location: UUID;

  values: string;
  parsed_values: Array<Atom> | void;

  term: string;
  source: ?string;

  constructor(
    type: UUID,
    object: UUID,
    event: UUID,
    location: UUID,
    values: ?string,
    term: ?string,
  ): Op {
    this.type = type;
    this.object = object;
    this.event = event;
    this.location = location;
    this.values = values || '';
    this.parsed_values = undefined;

    this.term = term || ';';
    this.source = null; // FIXME remove
    return this;
  }

  value(i: number): Atom {
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

  isComment(): boolean {
    return this.type.eq(COMMENT);
  }

  // Get op UUID by index (0-3)
  uuid(i: 0 | 1 | 2 | 3): UUID {
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

  toString(ctxOp: ?Op): string {
    let ret = '';
    const ctx = ctxOp || ZERO;
    let expComma = ctx.term !== ';';

    for (const u of [0, 1, 2, 3]) {
      const uuid = this.uuid(u);
      const same = ctx.uuid(u);
      if (uuid.eq(same)) continue;
      let str = uuid.toString(same);
      ret += UUID_SEPS[u];
      ret += str;
    }

    ret += this.values;
    if (!this.values || (expComma && this.term !== ',') || (!expComma && this.term !== ';')) {
      ret += this.term;
    }
    return ret;
  }

  clone(): Op {
    return new Op(this.type, this.object, this.event, this.location, this.values, this.term);
  }

  equal(other: Op): boolean {
    return (
      this.uuid(0).eq(other.uuid(0)) &&
      this.uuid(1).eq(other.uuid(1)) &&
      this.uuid(2).eq(other.uuid(2)) &&
      this.uuid(3).eq(other.uuid(3)) &&
      this.values === other.values &&
      this.term === other.term
    );
  }

  static fromString(body: string, context: ?Op, offset: ?number): ?Op {
    let ctx = context || ZERO;
    const off = offset || 0;
    RE.lastIndex = off;
    const m: string[] | void = RE.exec(body);
    if (!m || m[0] === '' || m.index !== off) return null;
    if (m[1] === COMMENT.value) ctx = ZERO;
    let term = m[6];
    if (!term) {
      if (ctx.term === '!') {
        term = ',';
      } else {
        term = ctx.term;
      }
    }

    const ret = new Op(
      UUID.fromString(m[1], ctx.type),
      UUID.fromString(m[2], ctx.object),
      UUID.fromString(m[3], ctx.event),
      UUID.fromString(m[4], ctx.location),
      m[5],
      term,
    );
    ret.source = m[0];
    return ret;
  }
}

// Parse RON value atoms.
export function ron2js(values: string): Array<Atom> {
  VALUE_RE.lastIndex = 0;
  let m: string[] | void;
  const ret = [];

  while ((m = (VALUE_RE.exec(values): string[]))) {
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

// Serialize JS primitives into RON atoms.
export function js2ron(values: Array<Atom>): string {
  const ret = values.map(v => {
    if (v === undefined) return UUID_ATOM_SEP + ZERO_UUID.toString();
    if (v === null) return UUID_ATOM_SEP + NULL_UUID.toString();

    switch (v.constructor) {
      case String:
        const json = JSON.stringify(v);
        const escq = json.replace(/'/g, '\\u0027');
        return "'" + escq.substr(1, escq.length - 2) + "'";
      case Number:
        return Number.isInteger(v) ? INT_ATOM_SEP + v.toString() : FLOAT_ATOM_SEP + v.toString();
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
export const VALUE_RE = new RegExp(Grammar.ATOM.source, 'g');
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

  constructor(str: ?string): Frame {
    this.body = str ? str.toString() : '';
    this.last = ZERO;
    return this;
  }

  // Append a new op to the frame
  push(op: Op): void {
    if (this.last.isComment()) {
      this.last = ZERO;
    }

    this.body += op.toString(this.last);
    this.last = op;
  }

  pushWithTerm(op: Op, term: ',' | '!' | '?' | ';'): void {
    if (this.last.isComment()) {
      this.last = ZERO;
    }

    const clone = op.clone();
    clone.term = term;

    this.body += clone.toString(this.last);
    this.last = clone;
  }

  /*:: @@iterator(): Iterator<Op> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<Op> {
    return new Cursor(this.body);
  }

  toString(): string {
    return this.body;
  }

  mapUUIDs(fn: (UUID, number, number, Op) => UUID) {
    this.body = mapUUIDs(this.body, fn);
    for (const op of this) {
      this.last = op;
    }
  }

  equal(other: Frame): boolean {
    if (this.toString() === other.toString()) return true;
    const cursor = new Cursor(other.toString());
    for (const op of this) {
      const oop = cursor.op;
      if (!oop || !op.equal(oop)) return false;
      cursor.next();
    }
    return cursor.next().done;
  }

  isFullState(): boolean {
    for (const op of this) return op.isHeader() && op.uuid(3).isZero();
    return false;
  }

  isPayload(): boolean {
    for (const op of this) if (op.isRegular()) return true;
    return false;
  }

  filter(p: Op => boolean): Frame {
    const ret = new Frame();
    for (const op of this) if (p(op)) ret.push(op);
    return ret;
  }

  ID(): UUID {
    for (const op of this) return op.uuid(1);
    return ZERO_UUID;
  }

  unzip(): Op[] {
    const cumul: Op[] = [];
    for (const op of this) cumul.push(op);
    return cumul;
  }
}

// Substitute UUIDs in all of the frame's ops.
// Typically used for macro expansion.
export function mapUUIDs(rawFrame: string, fn: (UUID, number, number, Op) => UUID): string {
  const ret = new Frame();
  let index = -1;
  for (const op of new Frame(rawFrame)) {
    index++;
    ret.push(
      new Op(
        fn(op.type, 0, index, op) || op.type,
        fn(op.object, 1, index, op) || op.object,
        fn(op.event, 2, index, op) || op.event,
        fn(op.location, 3, index, op) || op.location,
        op.values,
        op.term,
      ),
    );
  }
  return ret.toString();
}

// Crop a frame, i.e. make a new [from,till) frame
export function slice(from: Cursor, till: Cursor): string {
  if (!from.op) return '';
  if (from.body !== till.body) throw new Error('iterators of different frames');
  let ret = from.op.toString();
  ret += from.body.substring(from.offset + from.length, till.op ? till.offset : undefined);
  return ret;
}

export class Cursor implements Iterator<Op> {
  body: string;
  offset: number;
  length: number;
  op: ?Op;
  ctx: ?Op;

  constructor(body: ?string): Cursor {
    this.body = body ? body.toString().trim() : '';
    this.offset = 0;
    this.length = 0;
    this.op = this.nextOp();
    return this;
  }

  toString(): string {
    return this.body;
  }

  clone(): Cursor {
    const ret = new Cursor(this.body);
    ret.offset = this.offset;
    ret.length = this.length;
    ret.op = this.op;
    ret.ctx = this.ctx;
    return ret;
  }

  nextOp(): ?Op {
    this.offset += this.length;
    if (this.offset === this.body.length) {
      this.op = null;
      this.length = 1;
    } else {
      const op = Op.fromString(this.body, this.ctx, this.offset);
      this.ctx = op;
      if (op) {
        if (op.isComment()) this.ctx = ZERO;
        if (op.source) this.length = op.source.length;
      }
      this.op = op;
    }
    return this.op;
  }

  eof(): boolean {
    return !this.op;
  }

  /*:: @@iterator(): Iterator<Op> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<Op> {
    return this;
  }

  next(): IteratorResult<Op, void> {
    const ret = this.op;
    if (ret) {
      this.nextOp();
      return { done: false, value: ret };
    } else {
      return { done: true };
    }
  }
}
