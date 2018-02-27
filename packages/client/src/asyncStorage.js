import {AsyncStorage as RNAS} from 'react-native';

// FIXME @flow

export default class AsyncStorage {
  set(key: string, value: string): Promise<void> {
    return new Promise((res, rej) => {
      RNAS.setItem(key, value, err => {
        if (err) return rej(err);
        res();
      });
    });
  }

  get(key: string): Promise<?string> {
    return new Promise((res, rej) => {
      RNAS.getItem(key, (err, result) => {
        if (err) return rej(err);
        res(result);
      });
    });
  }

  multiGet(keys: string[]): Promise<{[string]: ?string}> {
    return new Promise((res, rej) => {
      RNAS.multiGet(keys, (err, tuples) => {
        if (err) return rej(err);
        const ret = {};
        for (const [k, v] of tupels) {
          ret[k] = v || null;
        }
        res(ret);
      });
    });
  }

  remove(key: string): Promise<void> {
    return new Promise((res, rej) => {
      RNAS.removeItem(key, err => {
        if (err) return rej(err);
        res();
      });
    });
  }

  keys(): Promise<Array<string>> {
    return new Promise((res, rej) => {
      RNAS.getAllKeys((err, keys) => {
        if (err) return rej(err);
        res(keys || []);
      });
    });
  }
}
