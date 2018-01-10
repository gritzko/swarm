// @flow

export interface Storage {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | void>;
  remove(key: string): Promise<void>;
  keys(): Promise<Array<string>>;
}

export class InMemory implements Storage {
  storage: {[string]: string};

  constructor() {
    this.storage = {};
  }

  set(key: string, value: string): Promise<void> {
    this.storage[key] = value;
    return Promise.resolve();
  }

  get(key: string): Promise<string | void> {
    return Promise.resolve(this.storage[key]);
  }

  remove(key: string): Promise<void> {
    delete this.storage[key];
    return Promise.resolve();
  }

  keys(): Promise<Array<string>> {
    return Promise.resolve(Object.keys(this.storage));
  }
}
