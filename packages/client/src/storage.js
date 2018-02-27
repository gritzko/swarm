// @flow

export interface Storage {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<?string>;
  multiGet(keys: string[]): Promise<{[string]: ?string}>;
  remove(key: string): Promise<void>;
  keys(): Promise<Array<string>>;
}

export class InMemory implements Storage {
  storage: {[string]: string};

  constructor(storage: {[string]: string} = {}) {
    this.storage = storage;
  }

  set(key: string, value: string): Promise<void> {
    this.storage[key] = value;
    return Promise.resolve();
  }

  get(key: string): Promise<?string> {
    return Promise.resolve(this.storage[key] || null);
  }

  multiGet(keys: string[]): Promise<{[string]: ?string}> {
    const ret = {};
    for (const k of keys) {
      ret[k] = this.storage[k] || null;
    }
    return Promise.resolve(ret);
  }

  remove(key: string): Promise<void> {
    delete this.storage[key];
    return Promise.resolve();
  }

  keys(): Promise<Array<string>> {
    return Promise.resolve(Object.keys(this.storage));
  }
}

export class LocalStorage implements Storage {
  set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }

  get(key: string): Promise<?string> {
    return Promise.resolve(localStorage.getItem(key));
  }

  multiGet(keys: string[]): Promise<{[string]: ?string}> {
    const ret = {};
    for (const k of keys) {
      ret[k] = localStorage.getItem(k) || null;
    }
    return Promise.resolve(ret);
  }

  remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }

  keys(): Promise<Array<string>> {
    return Promise.resolve(Object.keys(localStorage));
  }
}
