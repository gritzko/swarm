function WSWrapper(url) {
    this.ws = new WebSocket(url);
}

WSWrapper.prototype.send = function (message) {
    //console.log('<<', message);
    this.ws.send(message);
};

WSWrapper.prototype.on = function (event, handler) {
    switch (event) {
    case 'data':
        this.ws.onmessage = function (message) {
            //console.log('>>', message.data);
            handler(message.data);
        };
        break;
    case 'error':
        this.ws.onerror = handler;
        break;
    case 'open':
        this.ws.onopen = handler;
        break;
    case 'close':
        this.ws.onclose = handler;
        break;
    default:
        console.error('unknown event: ', event);
    }
};

WSWrapper.prototype.close = function () {
    this.ws.close();
};
