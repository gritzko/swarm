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

  get(key: string): Promise<string | void> {
    return new Promise((res, rej) => {
      RNAS.getItem(key, (err, result) => {
        if (err) return rej(err);
        res(result != null ? result : undefined);
      });
    });
  }

  multiGet(keys: string[]): Promise<{[string]: string | void}> {
    return new Promise((res, rej) => {
      RNAS.multiGet(keys, (err, tuples) => {
        if (err) return rej(err);
        const ret = {};
        tuples.map((result, i, store) => {
          res[store[i][0]] = store[i][1] === null ? undefined : store[i][1];
        });
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
