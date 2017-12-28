// @flow

export interface Storage {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | void>;
  removeItem(key: string): Promise<void>;
}

export class InMemory implements Storage{
  storage: {[string]: string};

  constrictor() {
    this.storage = {};
  }

  setItem(key: string, value: string): Promise<void> {
    this.storage[key] = value;
    return Promise.resolve();
  }

  getItem(key: string): Promise<string | void> {
    return Promise.resolve(this.storage[key])
  }

  removeItem(key: string): Promise<void> {
    delete this.storage[key]
    return Promise.resolve();
  }
}
