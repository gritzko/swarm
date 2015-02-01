"use strict";

var env = require('./env');
var Spec = require('./Spec');

var State = { NEW: 1, HALF_OPENED: 2, OPENED: 3, CLOSING: 4, CLOSED: 5 };

var By = { UNKNOWN: 0, PEER: 1, LOCAL: 2 };

/**
 * A "pipe" is a channel to a remote Swarm Host. Pipe's interface
 * mocks a Host except all calls are serialized and sent to the
 * *stream*; any arriving data is parsed and delivered to the
 * local host. The *stream* must support an interface of write(),
 * end() and on('open'|'data'|'close'|'error',fn).
 */
function Pipe(host, stream, opts) {
    var pipe = this;
    if (!stream || !host) {
        throw new Error('new Pipe(host,stream[,opts])');
    }
    opts = opts || {};
    var peerId = null;
    var state = State.NEW;
    var openedBy = By.UNKNOWN;
    var closedBy = By.UNKNOWN;
    var serializer = opts.serializer || JSON;
    // don't send immediately, delay to bundle more messages
    var lastRecvTS = time();
    var lastSendTS = lastRecvTS;
    var delay = opts.delay || -1;
    var sendTimer = null;
    var bundle = {};
    // send empty keep-alive messages
    var keepAliveTimer = null;
    // timer for CLOSING --> CLOSE transition
    var tickingBombTimer = null;
    // connection errors increases reconnection timeout
    var errorsCount = opts.errorsCount || 0;

    Object.defineProperties(pipe, {
        state: { get: function () { return state; } },
        _host: { get: function () { return host; } },
        stream: { get: function () { return stream; } },
        opts: { get: function () { return opts; } },
        _id: { get: function () { return peerId; } },
        errorsCount: { get: function () { return errorsCount; } }
    });
    pipe.close = closePipe;
    pipe.deliver = deliver;
    pipe.spec = spec;
    pipe.toString = toString;

    // listen for stream events:
    stream.on('data', onStreamMessage);
    stream.on('close', onStreamClosed);
    stream.on('error', onStreamError);

    // start keep-alive timer
    keepAliveTimer = setInterval(keepAliveFn, (Pipe.TIMEOUT / 4 + Math.random() * 100) | 0);

    function onStreamMessage(data) {
        data = data.toString();
        env.trace && env.log(pipe, '.in', data);
        lastRecvTS = time();

        if (state === State.CLOSED) {
            env.log(pipe, '.error', 'message from closed pipe');
            return;
        }

        // convert message to operations list
        var bundle = serializer.parse(data);

        var spec_list = [];
        var spec;
        //parse specifiers
        for (spec in bundle) {
            if (spec) {
                spec_list.push(new Spec(spec));
            }
        }
        spec_list.sort().reverse();

        // process operations
        try {
            while ((spec = spec_list.pop())) {
                processSingleOperation(spec, bundle[spec]);
            }
            // reset errors counter when connection established and some data received
            errorsCount = -1;

        } catch (ex) {
            console.error('error processing operation: ', spec);
            state = State.CLOSED;
            closePipe(ex);
        }
    }

    function processSingleOperation(spec, val) {

        switch (state) {
        case State.OPENED: handleNormal(spec, val); break;
        case State.NEW: handleHandshakeRequest(spec, val); break;
        case State.HALF_OPENED: handleHandshakeResponse(spec, val); break;
        case State.CLOSING: handleClosing(spec, val); break;
        default: console.error('unexpected pipe state: ', state);
        }

        function handleNormal(spec, val) {
            if (spec.type() === 'Host') {
                switch (spec.op()) {
                case 'off':
                    closedBy = By.PEER;
                    if (openedBy === By.LOCAL) {
                        state = State.CLOSED;
                        val || (val = 'closed by uplink');
                    } else {
                        state = State.CLOSING;
                        startTickingBomb();
                    }
                    break;
                case 'reoff':
                    closedBy = By.PEER;
                    state = State.CLOSED;
                    break;
                }
            }
            host.deliver(spec, val, pipe);

            if (state === State.CLOSED) {
                closePipe(val);
            }
        }

        function handleHandshakeRequest(spec, val) {
            validateHandshakeSpec(spec, 'on');
            openedBy = By.PEER;
            state = State.HALF_OPENED;
            peerId = spec.id();
            // TODO access denied TODO
            host.deliver(spec, val, pipe);
        }

        function handleHandshakeResponse(spec, val) {
            validateHandshakeSpec(spec, 'reon');
            state = State.OPENED;
            peerId = spec.id();
            host.deliver(spec, val, pipe);
        }

        function handleClosing(spec, val) {
            if (spec.type() !== 'Host') { throw new Error('unexpected operation received (wrong type in spec)'); }
            if (spec.op() !== 'reoff') { throw new Error('unexpected operation received (wrong operation in spec)'); }
            state = State.CLOSED;
            host.deliver(spec, val, pipe);
            closePipe();
        }

        function validateHandshakeSpec(spec, op) {
            if (spec.type() !== 'Host') { throw new Error('invalid handshake request (wrong type in spec)'); }
            if (spec.id() === host._id) { throw new Error('invalid handshake request (self handshake)'); }
            if (spec.op() !== op) { throw new Error('invalid handshake request (wrong operation in spec)'); }
        }
    }

    function onStreamClosed(reason) {
        if (!stream) { return; }
        stream = null; // needs no further attention
        closePipe('stream closed');
    }

    function onStreamError(err) {
        closePipe('stream error: ' + err);
    }

    /** @return {number} current time (milliseconds) */
    function time() {
        return new Date().getTime();
    }

    /** executed by timer for catching silent disconnection */
    function keepAliveFn() {
        var now = time();
        var sinceRecv = now - lastRecvTS;
        var sinceSend = now - lastSendTS;
        if (state === State.OPENED && sinceSend > Pipe.TIMEOUT / 2) {
            sendBundle();
        }
        if (sinceRecv > Pipe.TIMEOUT) {
            closePipe("stream timeout");
        }
    }

    /** Sends operation to the peer */
    function deliver(spec, val, src) {
        var sendImmediately = false;
        if (val && val.constructor === Spec) {
            val = val.toString();
        }

        switch (state) {
        case State.OPENED:
            if (spec.type() === 'Host') {
                switch (spec.op()) {
                case 'off':
                    state = State.CLOSING;
                    closedBy = By.LOCAL;
                    sendImmediately = true;
                    startTickingBomb();
                    break;
                case 'reoff':
                    state = Pipe.CLOSED;
                    sendImmediately = true;
                    break;
                }
            }
            break;

        case State.CLOSING:
            validateTypeOp(spec, 'Host', 'reoff');
            state = State.CLOSED;
            sendImmediately = true;
            break;

        case State.HALF_OPENED:
            validateTypeOp(spec, 'Host', 'reon');
            state = State.OPENED;
            sendImmediately = true;
            break;

        case State.NEW:
            validateTypeOp(spec, 'Host', 'on');
            state = State.HALF_OPENED;
            openedBy = By.LOCAL;
            sendImmediately = true;
            break;

        case State.CLOSED:
            return;
        }

        bundle[spec] = val === undefined ? null : val; // TODO aggregation

        if (sendImmediately || delay === -1) {
            if (sendTimer) {
                clearTimeout(sendTimer);
                sendTimer = null;
            }
            sendBundle();

            if (state === State.CLOSED) {
                closePipe();
            }
        } else if (!sendTimer) {
            var now = time();
            var gap = now - lastSendTS;
            var timeout = gap > delay ? delay : delay - gap;
            sendTimer = setTimeout(sendBundle, timeout); // hmmm...
        } // else {} // just wait

        function validateTypeOp(spec, type, op) {
            if (spec.type() !== type) { throw new Error('unexpected operation sending (wrong type)'); }
            if (spec.op() !== op) { throw new Error('unexpected operation sending (wrong operation)'); }
        }
    }

    function startTickingBomb() {
        if (!tickingBombTimer) {
            tickingBombTimer = setTimeout(function onNoReoffTimer() {
                tickingBombTimer = null;
                if (closedBy === By.LOCAL) {
                    // imitate peer response
                    processSingleOperation(host.newEventSpec('reoff'), 'no reoff within 5sec');
                } else {
                    closePipe('no reoff withing 5sec');
                }
            }, 5000);
        }
    }

    /**
     * Close the underlying stream.
     * note: may be invoked multiple times
     * @param {Error|string?} error
     */
    function closePipe(error) {
        env.log(pipe, '.close', error ? 'error: ' + error : 'normal', state);

        switch (state) {
        case State.CLOSING:
            switch (closedBy) {
            case By.PEER:
                deliver(host.newEventSpec('reoff'), error);
                return;
            case By.LOCAL:
                processSingleOperation(host.newEventSpec('reoff'), error);
                return;
            default:
                state = State.CLOSED;
            }
            break;

        case State.OPENED:
            // emulate normal off/reoff
            switch (openedBy) {
            case By.LOCAL:
                processSingleOperation(host.newEventSpec('reoff'), error);
                return;
            case By.PEER:
                processSingleOperation(host.newEventSpec('off'), error);
                return;
            default:
                state = State.CLOSED;
            }
            break;
        }

        if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
        }
        if (tickingBombTimer) {
            clearTimeout(tickingBombTimer);
            tickingBombTimer = null;
        }
        if (stream) {
            var s = stream;
            stream = null;
            try {
                s.close();
            } catch (ex) {}
        }
    }

    /** @returns {Spec|string} remote host spec "/Host#peerId" or empty string (when not handshaken yet) */
    function spec() {
        return peerId ? new Spec('/Host#' + peerId) : '';
    }

    /** Sends operations buffered in `bundle` */
    function sendBundle() {
        var payload = serializer.stringify(bundle);
        bundle = {};
        if (!stream) {
            sendTimer = null;
            return; // too late
        }

        try {
            env.trace && env.log(pipe, '.out', payload);
            stream.write(payload);
            lastSendTS = time();
        } catch (ex) {
            env.error('stream error on write: ' + ex, ex.stack);
            closePipe('stream write error');
        } finally {
            sendTimer = null;
        }
    }

    function toString() {
        return '/Pipe#' + (peerId || 'new_or_closed');
    }
}

Pipe.State = State;
Pipe.TIMEOUT = 60000; //ms

module.exports = Pipe;
