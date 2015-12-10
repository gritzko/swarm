# Swarm: a basic server

A simple LevelDB-backed WebSocket and HTTP-listening server.

## CLI

Simple command-line use examples:

```bash
npm install -g swarm-server
# WebSocket-only Swarm server, runs REPL, which is good for debugging
swarm-server --listen ws://localhost:8080 --db test_db --repl
> Swarm.server.replica.streams;
{}
> process.exit(0);
# Run a server for a database test_db, do garbage collection every 60sec
swarm-server --listen ws://localhost:8080 --db test_db --gc 60
# Demo config, see http://localhost:8080 for a simple demo
swarm-server --demo
# Run HTTP and WebSocket server for statics and data respectively.
# Server files from ./static/ and a db named 'data'.
swarm-server --listen http://localhost:8080 --static ./static/ --db data
```

## API

API use example:

    var SwarmServer = require('swarm-server');
    var server = new SwarmServer({
            listen: 'ws://localhost:8000', // or 'tcp://localhost:9000'
            // ws_server: ws_server,  // may use an existing ws server
            // http_server: http_server, // ...or an HTTP server
            ssn_id: 'swarm~0',
            db_id:  'db',
            callback: report
        });

    function report (err) {
        if (err) {
            console.error('listen fails:', err);
        } else {
            console.log('listening');
        }
    }

SwarmServer can be added to a running WebSocket/TCP server or any other server that emits a `connection` event where a data stream is an argument.

    var WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({ port: 8080 });
    var SwarmServer = require('swarm-server');
        var server = new SwarmServer({ server: wss });


for working examples,  see the `swarm-examples` package.
for a default client, see `swarm-client`.
