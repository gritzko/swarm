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
    this._last = new UUID(value, this._origin);
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
