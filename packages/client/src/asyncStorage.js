// @flow

// $FlowFixMe
import { AsyncStorage } from 'react-native';
import Mutex from './mutex';

export default class {
  mu: Mutex;

  constructor() {
    this.mu = new Mutex();
  }

  merge(
    key: string,
    reduce: (prev: string | null) => string | null,
  ): Promise<string | null> {
    return this.mu.lock(key, async () => {
      let prev = await AsyncStorage.getItem(key);
      prev = typeof prev === 'undefined' ? null : prev;
      const value = reduce(prev);
      if (value !== null) {
        await AsyncStorage.setItem(key, value);
      } else if (prev !== null) {
        await AsyncStorage.removeItem(key);
      }
      return value;
    });
  }

  set(key: string, value: string): Promise<void> {
    return new Promise((res, rej) => {
      AsyncStorage.setItem(key, value, err => {
        if (err) return rej(err);
        res();
      });
    });
  }

  get(key: string): Promise<string | null> {
    return new Promise((res, rej) => {
      AsyncStorage.getItem(key, (err, result) => {
        if (err) return rej(err);
        res(typeof result === 'undefined' ? null : result);
      });
    });
  }

  multiGet(keys: string[]): Promise<{ [string]: string | null }> {
    return new Promise((res, rej) => {
      AsyncStorage.multiGet(keys, (err, tuples) => {
        if (err) return rej(err);
        const ret = {};
        tuples.map((result, i, store) => {
          const key = store[i][0];
          const value = store[i][1];
          ret[key] = value;
        });
        res(ret);
      });
    });
  }

  remove(key: string): Promise<void> {
    return new Promise((res, rej) => {
      AsyncStorage.removeItem(key, err => {
        if (err) return rej(err);
        res();
      });
    });
  }

  keys(): Promise<Array<string>> {
    return new Promise((res, rej) => {
      AsyncStorage.getAllKeys((err, keys) => {
        if (err) return rej(err);
        res(keys || []);
      });
    });
  }
}
