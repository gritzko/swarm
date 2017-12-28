/* @flow */
"use strict";

import Clock from 'swarm-clock';

import Op, {Frame, Cursor, UUID, QUERY_SEP, mapUUIDs} from 'swarm-ron';
import {ZERO, NEVER} from 'swarm-ron-uuid';
import { reduce } from "swarm-rdt"


/** A simple client, keeps data in memory.
 *  Consumes updates from the server, feeds resulting RON states
 *  back to the listeners. */
class Client {

  clock: Clock;
  lstn: {[string]: (string) => void}; // ?
  store: {[string]: string};
  log: Frame;
  upstream: any;

  constructor(clock: Clock, options: ?{}) {
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
    for (const op of new Frame(query)) {
      const key = op.key();
      let base = ZERO;
      const stored = this.store[key];
      if (stored) {
        stream.update("", stored);
        base = new Cursor(stored).op.event;
      }
      if (key in this.lstn) throw new Error("TODO: many listeners per obj");
      if (this.upstream)
        fwd.push(new Op(op.type, op.object, base, ZERO, QUERY_SEP));
      this.lstn[key] = stream;
    }
    if (this.upstream) this.upstream.on(fwd.toString(), this);
  }

  off(query: any, stream: any) {
    const fwd = new Frame();
    for (const op of  new Frame(query)) {
      const uuid = op.object;
      delete this.lstn[uuid];
      if (this.upstream) {
        this.upstream.off(
          new Op(op.type, op.object, NEVER, ZERO, '').toString(),
          this
        ); // FIXME map?!
      }
    }
  }

  push(rawFrame: string) {
    const stamps: {[UUID]: UUID} = {};
    // replace
    const frame = mapUUIDs(rawFrame.toString(), uuid => {
      if (!uuid.isName() || !uuid.isZero()) return uuid;
      if (stamps[uuid]) return stamps[uuid];
      return (stamps[uuid] = this.clock.time());
    });

    // update
    this.update(frame);
    // save
    const op = Op.fromString(frame);
    if (op) this.log.push(op);
    // if (this.upstream) this.upstream.push(new Op.Cursor(frame));
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
    const i = new Frame(frame);
    if (i.op.event.origin === this.clock.origin) {
      // ack
    }
    const key = i.op.key();
    const state = this.store[key];
    const new_state = state ? reduce(state, frame) : frame;
    this.store[key] = new_state;
    const l = this.lstn[key];
    if (l) l.update(frame, new_state);
  }
}

module.exports = Client;
