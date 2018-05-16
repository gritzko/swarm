/**
 * This code copied from https://github.com/vmakhaev/reconnectable-websocket
 * for minor specific changes.
 *
 * Author Vladimir Makhaev.
 */

const defaultOptions = {
  debug: false,
  automaticOpen: true,
  reconnectOnError: false,
  reconnectInterval: 1000,
  maxReconnectInterval: 30000,
  reconnectDecay: 1.5,
  timeoutInterval: 2000,
  maxReconnectAttempts: null,
  randomRatio: 3,
  binaryType: 'blob',
  reconnectOnCleanClose: false,
};

class ReconnectableWebSocket {
  constructor(url, protocols = [], options = {}) {
    this._url = url;
    this._protocols = protocols;
    this._options = Object.assign({}, defaultOptions, options);
    this._reconnectAttempts = 0;
    this.readyState = ReconnectableWebSocket.CONNECTING;
    this.wasClean = false;

    if (typeof this._options.debug === 'function') {
      this._debug = this._options.debug;
    } else if (this._options.debug) {
      this._debug = console.log.bind(console);
    } else {
      this._debug = function() {};
    }

    if (this._options.automaticOpen) this.open();
  }

  open = () => {
    this.wasClean = false;
    let socket = (this._socket = new WebSocket(this._url, this._protocols));
    socket.binaryType = this._options.binaryType;

    if (
      this._options.maxReconnectAttempts &&
      this._options.maxReconnectAttempts < this._reconnectAttempts
    ) {
      return;
    }

    this._syncState();

    socket.onmessage = this._onmessage.bind(this);
    socket.onopen = this._onopen.bind(this);
    socket.onclose = this._onclose.bind(this);
    socket.onerror = this._onerror.bind(this);
  };

  send = data => {
    if (this._socket && this._socket.readyState === ReconnectableWebSocket.OPEN) {
      this._socket.send(data);
    } else if (!this._socket || this._socket.readyState > ReconnectableWebSocket.OPEN) {
      this._tryReconnect();
    }
  };

  close = (code, reason) => {
    this.wasClean = true;
    if (typeof code === 'undefined') code = 1000;
    if (this._socket && this._socket.readyState === ReconnectableWebSocket.OPEN) {
      this._socket.close(code, reason);
    }
  };

  _onmessage = message => {
    this.onmessage && this.onmessage(message);
  };

  _onopen = event => {
    this._syncState();
    this._reconnectAttempts = 0;

    this.onopen && this.onopen(event);
  };

  _onclose = event => {
    this._syncState();
    this._debug('WebSocket: connection is broken', event);

    this.onclose && this.onclose(event);

    this._tryReconnect(event);
  };

  _onerror = event => {
    // To avoid undetermined state, we close socket on error
    this.close();

    this._debug('WebSocket: error', event);
    this._syncState();

    this.onerror && this.onerror(event);

    if (this._options.reconnectOnError) this._tryReconnect(event);
  };

  _tryReconnect = e => {
    if (this.wasClean && !this._options.reconnectOnCleanClose) {
      return;
    }
    setTimeout(() => {
      if (
        this.readyState === ReconnectableWebSocket.CLOSING ||
        this.readyState === ReconnectableWebSocket.CLOSED
      ) {
        this._reconnectAttempts++;
        this.open();
      }
    }, this._getTimeout());
  };

  _getTimeout = () => {
    let timeout =
      this._options.reconnectInterval *
      Math.pow(this._options.reconnectDecay, this._reconnectAttempts);
    timeout =
      timeout > this._options.maxReconnectInterval ? this._options.maxReconnectInterval : timeout;
    return this._options.randomRatio
      ? getRandom(timeout / this._options.randomRatio, timeout)
      : timeout;
  };

  _syncState = () => {
    this.readyState = this._socket.readyState;
  };
}

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

ReconnectableWebSocket.CONNECTING = 0;
ReconnectableWebSocket.OPEN = 1;
ReconnectableWebSocket.CLOSING = 2;
ReconnectableWebSocket.CLOSED = 3;

export default ReconnectableWebSocket;
