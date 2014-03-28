var ws_lib = require('ws');

function WSWrapper(ws) {
    this.ws = ws;
}
WSWrapper.prototype.send = function (message) {
    this.ws.send(message);
};
WSWrapper.prototype.on = function (event, handler) {
    switch (event) {
    case 'data':
        this.ws.on('message', handler);
        break;
    default:
        this.ws.on(event, handler);
    }
};
WSWrapper.prototype.close = function () {
    this.ws.close();
};

module.exports = WSWrapper;