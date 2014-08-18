var Model = require('../../../lib/Model');

// Our key class: a mouse pointer :)
module.exports = Model.extend('Mouse', {
    defaults: {
        x: 0,
        y: 0,
        symbol: '?',
        ms: 0// last activity timestamp
    }
});
