'use strict';

function noop() {

}

var STUB = {
  deliver: noop,
  on: noop,
  off: noop
};

module.exports = STUB;
