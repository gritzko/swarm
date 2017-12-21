/* @flow */
"use strict";

import type Stringer from 'swarm-ron/lib/types';
import Clock from 'swarm-clock';

const UUID = require("swarm-ron-uuid");
const Op = require("swarm-ron");
const RDT = require("swarm-rdt");
const Stream = Op.Stream;
const Frame = Op.Frame;
const Iterator = Frame.Iterator;


/** A simple client, keeps data in memory.
 *  Consumes updates from the server, feeds resulting RON states
 *  back to the listeners. */
class Client extends Stream {

  clock: Clock;
  lstn: {[string]: (string) => void}; // ?
  store: {[string]: string};
  log: Frame;
  upstream: ?Stream;

  constructor(clock: Clock, options?: {}) {
    super();
    /** @type {Clock} */
    this.clock = clock;
    this.lstn = {};
    this.store = {};
    /** @type {Frame} */
    this.log = new Frame();
    /** @type {Stream} */
    this.upstream = null;
  }

  /**
   * Set the upstream to get the data from.
   * @param upstream {Stream}
   */
  upstreamTo(upstream: any) {
    this.upstream = upstream;
    // FIXME resubscribe
  }

  /**
   * Install subscriptions.
   * @param query {String} - uuid/query/query frame
   * @param stream {Stream}
   */
  on(query: any, stream: any) {
    const fwd = new Frame();
    for (const i = new Iterator(query); i.op; i.nextOp()) {
      const key = i.op.key();
      let base = UUID.ZERO;
      const stored = this.store[key];
      if (stored) {
        stream.update("", stored);
        base = new Iterator(stored).op.event;
      }
      if (key in this.lstn) throw new Error("TODO: many listeners per obj");
      if (this.upstream)
        fwd.push(new Op(i.op.type, i.op.object, base, UUID.ZERO, Op.QUERY_SEP));
      this.lstn[key] = stream;
    }
    if (this.upstream) this.upstream.on(fwd.toString(), this);
  }

  off(query: any, stream: any) {
    const fwd = new Frame();
    for (const i = new Iterator(query); i.op; i.nextOp()) {
      const uuid = i.op.object;
      delete this.lstn[uuid];
      if (this.upstream) {
        this.upstream.off(
          new Op(i.op.type, i.op.object, UUID.NEVER, UUID.ZERO, '').toString(),
          this
        ); // FIXME map?!
      }
    }
  }

  push(rawFrame: Stringer) {
    const stamps: {[UUID]: UUID} = {};
    // replace
    const frame = Frame.mapUUIDs(rawFrame.toString(), uuid => {
      if (!uuid.isName() || !uuid.isZero()) return uuid;
      if (stamps[uuid]) return stamps[uuid];
      return (stamps[uuid] = this.clock.time());
    });

    // update
    this.update(frame);
    // save
    const op = Op.fromString(frame);
    if (op) this.log.push(op);
    if (this.upstream) this.upstream.push(new Op.Cursor(frame));
  }

  /**
   *
   * @param frame {String} -- a single RON frame
   */
  update(frame: string) {
    // ALLOWED INPUTS:
    // - op
    // - ack op
    // - state frame
    // - batch frame (split, repeat) TODO
    const i = new Iterator(frame);
    if (i.op.event.origin === this.clock.origin) {
      // ack
    }
    const key = i.op.key();
    const state = this.store[key];
    const new_state = state ? RDT.reduce(state, frame) : frame;
    this.store[key] = new_state;
    const l = this.lstn[key];
    if (l) l.update(frame, new_state);
  }
}

class Query extends Stream {
  constructor() {
    super();
  }

  on(frame, source) {}

  update(frame, source) {}
}

module.exports = Client;
