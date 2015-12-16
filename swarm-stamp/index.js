"use strict";

var Swarm = {
    base64: require('./src/base64'),
    VVector: require('./src/VVector'),
    LamportTimestamp: require('./src/LamportTimestamp'),
    VV: require('./src/VV'),
    AnchoredVV: require('./src/AnchoredVV'),
    LamportClock: require('./src/LamportClock'),
    TestClock: require('./src/LamportClock'),
    SecondPreciseClock: require('./src/SecondPreciseClock'),
    Clock: require('./src/SecondPreciseClock'), // the default
    MinutePreciseClock: require('./src/MinutePreciseClock')
//  AdaptableClock: require('./src/AdaptableClock') TODO
};

module.exports = Swarm;
