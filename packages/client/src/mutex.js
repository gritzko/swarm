// @flow

// inspired by https://github.com/plenluno/promise-mutex

export default class Mutex {
  locks: { [string]: true | void };

  constructor() {
    this.locks = {};
  }

  lock<T>(key: string = '~', f: () => Promise<T> | T): Promise<T> {
    const executor = (resolve, reject) => {
      if (!this._lock(key)) {
        setTimeout(() => {
          executor(resolve, reject);
        }, 0);
        return;
      }

      if (!(f instanceof Function)) {
        reject(new Error('argument not function'));
        this._unlock(key);
        return;
      }

      let r;
      try {
        r = f();
      } catch (e) {
        reject(e);
        this._unlock(key);
        return;
      }

      Promise.resolve(r)
        .then(res => {
          resolve(res);
          this._unlock(key);
        })
        .catch(err => {
          reject(err);
          this._unlock(key);
        });
    };

    return new Promise(executor);
  }

  isLocked(key: string = '~'): boolean {
    return !!this.locks[key];
  }

  _lock(key: string): boolean {
    if (!!this.locks[key]) return false;
    return (this.locks[key] = true);
  }

  _unlock(key: string): boolean {
    if (!this.locks[key]) return false;
    delete this.locks[key];
    return true;
  }
}
