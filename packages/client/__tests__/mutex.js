// @flow

import Mutex from '../src/mutex';

describe('mutex.lock(...)', () => {
  const mutex = new Mutex();

  test('returns a fulfilled promise if the given function succeeds', async () => {
    const res = await mutex.lock(undefined, () => 'abc');
    expect(res).toBe('abc');
  });

  test('returns a rejected promise if the given function fails', done => {
    const e = new Error();
    mutex
      .lock(undefined, () => {
        throw e;
      })
      .catch(err => {
        expect(err).toEqual(e);
        done();
      });
  });

  test('returns a rejected promise if the given argument is not a function', done => {
    // $FlowFixMe
    mutex.lock(undefined, 3).catch(err => {
      expect(err.toString()).toBe('Error: argument not function');
      done();
    });
  });

  test('allows only one promise chain to run at a time', done => {
    const xs = [];

    function task(x) {
      xs.push(x);
      return Promise.resolve(x);
    }

    function chain(x) {
      return task(x)
        .then(y => {
          return task(y);
        })
        .then(z => {
          return task(z);
        });
    }

    function run(x) {
      return mutex.lock(undefined, () => {
        return chain(x);
      });
    }

    Promise.all([run(5), run(8), run(11)]).then(rs => {
      expect(rs).toEqual([5, 8, 11]);
      expect(xs).toEqual([5, 5, 5, 8, 8, 8, 11, 11, 11]);
      done();
    });
  });
});

describe('mutex.isLocked(...)', () => {
  const mutex = new Mutex();
  it('returns false while being not locked', () => {
    expect(mutex.isLocked()).toBeFalsy();
  });

  it('returns true while being locked', done => {
    function task() {
      expect(mutex.isLocked()).toBeTruthy();
      return Promise.resolve(null);
    }

    function chain() {
      return task().then(() => {
        return task();
      });
    }

    mutex.lock(undefined, chain).then(() => {
      expect(mutex.isLocked()).toBeFalsy();
      done();
    });

    expect(mutex.isLocked()).toBeTruthy();
  });
});
