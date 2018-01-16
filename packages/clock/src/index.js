// @flow
'use strict';

import UUID, {ERROR, ZERO, BASE64, CODES} from 'swarm-ron-uuid';

export interface Clock {
  time(): UUID;
  last(): UUID;
  see(UUID): void;
  origin(): string;
}

/** Pure logical clock. */
export class Logical implements Clock {
  _origin: string;
  _last: UUID;
  length: number;

  /**
   * Create a new clock.
   * @param origin {String} - Base64x64 clock/process/replica id
   * @param options {Object} - various modes and options
   */
  constructor(origin: string, options: ?{|length: number, last: UUID | string|}) {
    this._origin = origin;
    this._last = ZERO;
    this.length = 5;
    if (options) {
      if (options.length) this.length = options.length;
      if (options.last) this._last = UUID.fromString(options.last.toString());
    }
  }

  /** Generates a fresh globally unique monotonous UUID.
   *  @return {UUID} */
  time(): UUID {
    let t = this._last.value;
    while (t.length < this.length) t += '0';
    let i = t.length - 1;
    while (t[i] === '~' && i >= 0) i--;
    if (i < 0) return ERROR;
    const value = t.substr(0, i) + BASE64[CODES[t.charCodeAt(i)] + 1];
    this._last = new UUID(value, this._origin, '+');
    return this._last;
  }

  /**
   * See an UUID. Can only generate larger UUIDs afterwards.
   * @param uuid {UUID}
   */
  see(uuid: UUID) {
    if (uuid.ge(this._last)) this._last = uuid;
  }

  origin(): string {
    return this._origin;
  }

  last(): UUID {
    return this._last;
  }
}

export class Calendar implements Clock {
  _last: UUID;
  _lastPair: Pair;
  _lastBase: string;
  _origin: string;
  _offset: number;
  _minlen: number;

  constructor(origin: string, options: {last?: UUID | string, offset?: number, minlen?: number} = {}) {
    this._offset = options.offset || 0;
    this._origin = origin;
    this._last = options.last ? UUID.fromString(options.last.toString()) : ZERO;
    this._lastPair = {high: -1, low: -1};
    this._lastBase = '0';
    this._minlen = options.minlen || 6;
  }

  time(): UUID {
    let pair = date2pair(new Date(Date.now() + this._offset));
    let next = pair2base(pair);

    if (pair.high <= this._lastPair.high || (pair.high === this._lastPair.high && pair.low <= this._lastPair.low)) {
      pair = furhter(pair, this._lastPair);
      next = pair2base(pair);
    } else if (this._minlen < 8) {
      next = relax(next, this._lastBase, this._minlen);
    }

    this._lastBase = next;
    this._lastPair = pair;
    this._last = new UUID(this._lastBase, this._origin, '+');
    return this._last;
  }

  see(uuid: UUID) {
    if (uuid.ge(this._last)) {
      this._last = uuid;
      this._lastBase = uuid.value;
      this._lastPair = base2pair(this._lastBase);
    }
  }

  origin(): string {
    return this._origin;
  }

  last(): UUID {
    return this._last;
  }
}

type Pair = {|high: number, low: number|};

function date2pair(d: Date): Pair {
  var high = (d.getUTCFullYear() - 2010) * 12 + d.getUTCMonth();
  high <<= 6;
  high |= d.getUTCDate() - 1;
  high <<= 6;
  high |= d.getUTCHours();
  high <<= 6;
  high |= d.getUTCMinutes();
  var low = d.getUTCSeconds();
  low <<= 12;
  low |= d.getUTCMilliseconds();
  low <<= 12;
  return {high, low};
}

function pair2date(pair: Pair): Date {
  let {low, high} = pair;
  low >>= 12;
  let msec = low & 4095;
  low >>= 12;
  let second = low & 63;
  let minute = high & 63;
  high >>= 6;
  let hour = high & 63;
  high >>= 6;
  let day = (high & 63) + 1;
  high >>= 6;
  let months = high & 4095;
  let month = months % 12;
  let year = 2010 + (((months - month) / 12) | 0);
  let ms = Date.UTC(year, month, day, hour, minute, second, msec);
  return new Date(ms);
}

function base2pair(base: string): Pair {
  const high = base64x32toInt(base.substr(0, 5));
  const low = base.length <= 5 ? 0 : base64x32toInt(base.substr(5, 5));
  return {high, low};
}

function pair2base(pair: Pair): string {
  var ret = intToBase64x32(pair.high, pair.low !== 0);
  if (pair.low === 0) {
    if (ret === '') {
      ret = '0';
    }
  } else {
    ret += intToBase64x32(pair.low, false);
  }
  return ret;
}

/** convert int to a Base64x32 number (right zeroes skipped) */
function intToBase64x32(i: number, pad: boolean) {
  if (i < 0 || i >= 1 << 30) {
    throw new Error('out of range: ' + i);
  }
  var ret = '',
    pos = 0;
  while (!pad && (i & 63) === 0 && pos++ < 5) {
    i >>= 6;
  }
  while (pos++ < 5) {
    ret = BASE64.charAt(i & 63) + ret;
    i >>= 6;
  }
  return ret;
}

function base64x32toInt(base: string): number {
  if (base.length > 5) {
    throw new Error('more than 30 bits');
  }
  var ret = 0,
    i = 0;
  while (i < base.length) {
    ret <<= 6;
    var code = base.charCodeAt(i);
    if (code >= 128) {
      throw new Error('invalid char');
    }
    var de = CODES[code];
    if (de === -1) {
      throw new Error('non-base64 char');
    }
    ret |= de;
    i++;
  }
  while (i++ < 5) {
    ret <<= 6;
  }
  return ret;
}

const MAX32 = (1 << 30) - 1;

function furhter(pair: Pair, prev: Pair): Pair {
  if (pair.low < MAX32) {
    return {high: Math.max(pair.high, prev.high), low: Math.max(pair.low, prev.low) + 1};
  } else {
    return {high: Math.max(pair.high, prev.high) + 1, low: 0};
  }
}

function relax(next: string, prev: string, minLength: number = 1): string {
  const reper = toFullString(prev);
  const mine = toFullString(next);
  let p = 0;
  while (p < 10 && mine[p] === reper[p]) p++;
  p++;
  if (p < minLength) p = minLength;
  return mine.substr(0, p);
}

function toFullString(base: string): string {
  return base + '0000000000'.substr(base.length);
}
