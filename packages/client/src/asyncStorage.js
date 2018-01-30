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
