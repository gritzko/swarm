// @flow

export interface Storage {
  merge(
    key: string,
    reduce: (prev: string | null) => string | null,
  ): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  multiGet(keys: string[]): Promise<{ [string]: string | null }>;
  remove(key: string): Promise<void>;
  keys(): Promise<Array<string>>;
}

export class InMemory implements Storage {
  storage: { [string]: string };

  constructor(storage: { [string]: string } = {}) {
    this.storage = storage;
  }

  merge(
    key: string,
    reduce: (prev: string | null) => string | null,
  ): Promise<string | null> {
    const value = reduce(
      this.storage.hasOwnProperty(key) ? this.storage[key] : null,
    );
    if (value !== null) {
      this.storage[key] = value;
    } else {
      delete this.storage[key];
    }
    return Promise.resolve(value);
  }

  set(key: string, value: string): Promise<void> {
    this.storage[key] = value;
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    const v = this.storage[key];
    return Promise.resolve(typeof v === 'undefined' ? null : v);
  }

  multiGet(keys: string[]): Promise<{ [string]: string | null }> {
    const ret = {};
    for (const k of keys) {
      ret[k] = this.storage[k];
      if (typeof ret[k] === 'undefined') ret[k] = null;
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
  merge(
    key: string,
    reduce: (prev: string | null) => string | null,
  ): Promise<string | null> {
    // $FlowFixMe
    const value = reduce(localStorage.getItem(key));
    if (value !== null) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
    return Promise.resolve(value);
  }

  set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    const v = localStorage.getItem(key);
    return Promise.resolve(typeof v === 'undefined' ? null : v);
  }

  multiGet(keys: string[]): Promise<{ [string]: string | null }> {
    const ret = {};
    for (const k of keys) {
      const item = localStorage.getItem(k);
      ret[k] = typeof item === 'undefined' ? null : item;
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
