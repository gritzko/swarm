"use strict";

var exports = {
    base64: require('./src/base64'),
    VVector: require('./src/VVector'),
    LamportTimestamp: require('./src/LamportTimestamp'),
    VV: require('./src/VV'),
    AnchoredVV: require('./src/AnchoredVV'),
    LamportClock: require('./src/LamportClock'),
    SecondPreciseClock: require('./src/SecondPreciseClock'),
    MinutePreciseClock: require('./src/MinutePreciseClock')
//    AdaptableClock: require('./src/AdaptableClock')
};

exports.Clock = exports.SecondPreciseClock;
exports.TestClock = exports.LamportClock;

module.exports = exports;
