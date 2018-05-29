// @flow
'use strict';

import RON from '@swarm/ron-grammar';

export default class UUID {
  value: string;
  origin: string;
  sep: string;

  constructor(value: string, origin: string, sep: ?string): UUID {
    this.value = value;
    this.origin = origin;
    this.sep = sep || '-';
    return this;
  }

  get type(): string {
    return this.sep; // TODO swap, phase out
  }

  toJSON(): string {
    return this.toString();
  }

  toString(ctxUUID?: UUID): string {
    const ctx = ctxUUID || ZERO;
    if (this.origin === '0') {
      // nice shortcuts
      if (TIME_CONST[this.value]) {
        if (this.sep === '-') return this.value;
      } else {
        if (this.sep === '$') return this.value;
      }
    }
    if (this.origin === ctx.origin) {
      if (this.value === ctx.value) return this.sep === ctx.sep ? '' : this.sep;
      let zip = UUID.zip64(this.value, ctx.value);
      const expSep = zip === this.value ? '$' : '-';
      return expSep === this.sep ? zip : zip + this.sep;
    } else {
      const time = UUID.zip64(this.value, ctx.value);
      const orig = UUID.zip64(this.origin, ctx.origin);
      if (this.sep !== '-' || orig === this.origin) {
        return time + this.sep + orig;
      } else {
        return time ? time + this.sep + orig : this.sep + orig;
      }
    }
  }

  le(uuid: UUID): boolean {
    if (uuid.value === this.value) return uuid.origin > this.origin;
    return uuid.value > this.value;
  }

  ge(uuid: UUID): boolean {
    if (uuid.value === this.value) return uuid.origin < this.origin;
    return uuid.value < this.value;
  }

  gt(uuid: UUID): boolean {
    return !this.le(uuid);
  }

  lt(uuid: UUID): boolean {
    return !this.ge(uuid);
  }

  eq(uuid: UUID): boolean {
    return this.value === uuid.value && this.origin === uuid.origin && this.sep === uuid.sep;
  }

  isZero(): boolean {
    return this.value === '0';
  }

  static fromString(string: string, ctxUUID?: ?UUID, offset?: number): UUID {
    const ctx = ctxUUID || ZERO;
    if (!string) return ctx;
    const off = offset === undefined ? 0 : offset;
    RE.lastIndex = off;
    const m: string[] = RE.exec(string);
    if (!m || m.index !== off) return ERROR;
    if (offset === undefined && m[0] !== string) return ERROR;
    const time = UUID.unzip64(m[1], ctx.value);
    if (!m[2] && !m[3] && m[1] === time && !TIME_CONST[time]) {
      return new UUID(time, '0', '$'); // nice shortcut
    } else if (!m[1] && !m[2] && !m[3]) {
      return ctx;
    } else {
      const orig = UUID.unzip64(m[3], ctx.origin);
      return new UUID(time, orig, m[2] || ctx.sep);
    }
  }

  static unzip64(zip: string, ctx: string): string {
    if (!zip) return ctx;
    let ret = zip;
    const prefix = PREFIXES.indexOf(ret[0]);
    if (prefix !== -1) {
      let pre = ctx.substr(0, prefix + 4);
      while (pre.length < prefix + 4) pre += '0';
      ret = pre + ret.substr(1);
    }
    while (ret.length > 1 && ret[ret.length - 1] === '0') ret = ret.substr(0, ret.length - 1);
    return ret;
  }

  static zip64(int: string, ctx: string): string {
    if (int === ctx) return '';
    let p = 0;
    while (int[p] === ctx[p]) p++;
    if (p === ctx.length) while (int[p] === '0') p++;
    if (p < 4) return int;
    return PREFIXES[p - 4] + int.substr(p);
  }

  isTime(): boolean {
    return this.sep === '-' || this.sep === '+';
  }

  isEvent(): boolean {
    return this.sep === '-';
  }

  isDerived(): boolean {
    return this.sep === '+';
  }

  isHash(): boolean {
    return this.sep === '%';
  }

  isName(): boolean {
    return this.sep === '$';
  }

  // overflows js ints!
  static base2int(base: string): number {
    var ret = 0;
    var i = 0;
    while (i < base.length) {
      ret <<= 6;
      ret |= CODES[base.charCodeAt(i)];
      i++;
    }
    while (i < 10) {
      ret <<= 6;
      i++;
    }
    return ret;
  }

  compare(uuid: UUID): number {
    if (this.eq(uuid)) return 0;
    return this.lt(uuid) ? -1 : 1;
  }

  isLocal(): boolean {
    return this.origin === LOCAL;
  }

  local(): UUID {
    return new UUID(this.value, LOCAL, this.sep);
  }

  isError(): boolean {
    return this.value === '~~~~~~~~~~' || this.origin === '~~~~~~~~~~';
  }
}

export const ZERO = new UUID('0', '0');
export const NEVER = new UUID('~', '0');
export const COMMENT = NEVER;
export const ERROR = new UUID('~~~~~~~~~~', '0');
export const RE = new RegExp(RON.UUID.source, 'g');
export const PREFIXES = '([{}])';
export const TIME_CONST = { '0': 1, '~': 1, '~~~~~~~~~~': 1 };
export const LOCAL = `~local`;

export const BASE64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
export const CODES: Int8Array = new Int8Array(128);
for (let i = 0; i < 128; i++) CODES[i] = -1;
for (let i = 0; i < BASE64.length; i++) CODES[BASE64.charCodeAt(i)] = i;

export class Vector {
  body: string;
  defaultUUID: UUID;
  last: UUID;

  constructor(uuids: string = '', defaultUUID?: UUID = ZERO): Vector {
    this.body = uuids;
    this.defaultUUID = defaultUUID || ZERO;
    this.last = this.defaultUUID;
    return this;
  }

  /*:: @@iterator(): Iterator<UUID> { return ({}: any); } */

  // $FlowFixMe
  [Symbol.iterator](): Iterator<UUID> {
    return new Iter(this.body, this.defaultUUID);
  }

  push(newUUID: UUID | string): void {
    const uuid = UUID.fromString(newUUID.toString());
    const str = uuid.toString(this.last);
    if (this.body) this.body += ',';
    this.body += str;
    this.last = uuid;
  }

  toString(): string {
    return this.body;
  }
}

export class Iter {
  body: string;
  offset: number;
  uuid: UUID | null;

  constructor(body: string = '', defaultUUID: UUID = ZERO): Iter {
    this.body = body;
    this.offset = 0;
    this.uuid = defaultUUID;
    this.nextUUID();
    return this;
  }

  toString(): string {
    return this.body.substr(this.offset);
  }

  nextUUID(): void {
    if (this.offset === this.body.length) {
      this.uuid = null;
    } else {
      this.uuid = UUID.fromString(this.body, this.uuid, this.offset);
      if (RE.lastIndex === 0 && this.offset !== 0) this.offset = this.body.length;
      else this.offset = RE.lastIndex;
      if (this.body[this.offset] === ',') this.offset++;
    }
  }

  // waiting for https://github.com/prettier/prettier/issues/719 to enable on-save formatting
  //
  /*::  @@iterator(): Iterator<UUID> { return ({}: any); } */

  // $FlowFixMe
  [Symbol.iterator](): Iterator<UUID> {
    return this;
  }

  next(): IteratorResult<UUID, void> {
    const ret = this.uuid;
    if (ret === null) {
      return { done: true };
    } else {
      this.nextUUID();
      return {
        done: false,
        value: ret,
      };
    }
  }
}
