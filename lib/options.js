'use strict';

var djb2Hash = require('./djb2Hash');

module.exports = {
  streams: {},
  debug: true,
  localhost: undefined,
  hashFunction: djb2Hash
};
