// @flow

// $FlowFixMe
import { AsyncStorage } from 'react-native';

export default class {
  set(key: string, value: string): Promise<void> {
    return new Promise((res, rej) => {
      AsyncStorage.setItem(key, value, err => {
        if (err) return rej(err);
        res();
      });
    });
  }

  get(key: string): Promise<string | void> {
    return new Promise((res, rej) => {
      AsyncStorage.getItem(key, (err, result) => {
        if (err) return rej(err);
        res(result != null ? result : undefined);
      });
    });
  }

  multiGet(keys: string[]): Promise<{ [string]: string | void }> {
    return new Promise((res, rej) => {
      AsyncStorage.multiGet(keys, (err, tuples) => {
        if (err) return rej(err);
        const ret = {};
        tuples.map((result, i, store) => {
          const key = store[i][0];
          const value = store[i][1];
          ret[key] = value === null ? undefined : value;
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
