//  S P E C I F I E R
//
//  The Swarm aims to switch fully from the classic HTTP
//  request-response client-server interaction pattern to continuous
//  real-time synchronization (WebSocket), possibly involving
//  client-to-client interaction (WebRTC) and client-side storage
//  (WebStorage). That demands (a) unification of transfer and storage
//  where possible and (b) transferring, processing and storing of
//  fine-grained changes.
//
//  That's why we use compound event identifiers named *specifiers*
//  instead of just regular "plain" object ids everyone is so used to.
//  Our ids have to fully describe the context of every small change as
//  it is likely to be delivered, processed and stored separately from
//  the rest of the related state.  For every atomic operation, be it a
//  field mutation or a method invocation, a specifier contains its
//  class, object id, a method name and, most importantly, its
//  version id.
//
//  A serialized specifier is a sequence of Base64 tokens each prefixed
//  with a "quant". A quant for a class name is '/', an object id is
//  prefixed with '#', a method with '.' and a version id with '!'.  A
//  special quant '+' separates parts of each token.  For example, a
//  typical version id looks like "!7AMTc+gritzko" which corresponds to
//  a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko (see
//  Host.time()).
//
//  A full serialized specifier looks like
//        /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
//  (a todo item created by @gritzko was marked 'done' by himself)
//
//  Specifiers are stored in strings, but we use a lightweight wrapper
//  class Spec to parse them easily. A wrapper is immutable as we pass
//  specifiers around a lot.
'use strict';

/**
 * Derive version vector from the state
 * @see Syncable.version
 * @see VersionVector
 * @returns {string} string representation of VersionVector
 */

var options = require('./options');

module.exports = {
  STUB: require('./STUB'),

  options: require('./options'),

  Host: require('./Host'),
  Syncable: require('./Syncable'),
  Model: require('./Model'),
  Set: require('./Set'),
  Spec: require('./Spec'),
  VersionVector: require('./VersionVector'),

  setLocalhost: function(host) {
    options.localhost = host;
  },

  /**
   * Configure hash function to be used by Swarm.
   *
   *    var murmur = require('swarm/lib/murmur')
   *    var Swarm = require('swarm')
   *
   *    Swarm.setHashFunction(murmur)
   *
   * @param {Function} hashFunction
   */
  setHashFunction: function(hashFunction) {
    options.hashFunction = hashFunction;
  },

  registerProtocolHandler: function(protocol, handler) {
    options.streams[protocol] = handler;
  }
};
