// @flow

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
  send(data: string): void {}
  close(): void {}
  open(): void {}
}
