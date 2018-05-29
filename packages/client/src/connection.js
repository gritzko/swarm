// @flow

import RWS from './rws';
import Op from '@swarm/ron';
import { ZERO } from '@swarm/ron-uuid';
import { Frame } from '@swarm/ron';

export interface Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  send(data: string): void;
  readyState: number;
  close(): void;
  open(): void;
}

// DevNull connection is used for permanent offline-mode
export class DevNull implements Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  readyState: number;
  constructor() {
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 0;
      this.onopen && this.onopen(new Event(''));
    }, 0);
  }

  send(data: string): void {
    if (!this.onmessage) return;
    const frame = new Frame(data);
    if (!frame.isPayload()) return;
    for (const op of frame) {
      if (!op.uuid(2).eq(ZERO)) {
        setTimeout(() => {
          // $FlowFixMe
          this.onmessage({ data: `@${op.uuid(2).toString()}!` });
        }, 0);
        return;
      }
    }
  }

  close(): void {}
  open(): void {}
}

export class Verbose extends RWS implements Connection {
  _om: (ev: MessageEvent) => any;
  _oo: (ev: Event) => any;

  constructor(url: string, protocols: string[] = [], options: {} = {}) {
    super(url, protocols, options);
    const send = this.send;
    this.send = (data: string): void => {
      console.log(
        '%c(≶) %c%s %c%s',
        'color: blue',
        'color: green;',
        '~>',
        'color: #aaa',
        data,
      );
      send(data);
    };
  }

  get onopen(): (ev: Event) => any {
    return (ev: Event) => {
      console.log(
        '%c(≶) %c%s',
        'color: blue;',
        'color: green;',
        // $FlowFixMe
        'connected to ' + this._url,
      );
      this._oo(ev);
    };
  }

  set onopen(m: (ev: Event) => void): void {
    this._oo = m;
  }

  get onmessage(): (ev: MessageEvent) => any {
    return (ev: MessageEvent) => {
      console.log(
        '%c(≶) %c%s %c%s',
        'color: blue;',
        'color: red;',
        '<~',
        'color: #aaa',
        ev.data,
      );
      this._om(ev);
    };
  }

  set onmessage(m: (ev: MessageEvent) => any): void {
    this._om = m;
  }
}
