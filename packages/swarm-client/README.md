# Swarm: browser client

A Swarm sync client backed by IndexedDB (optionally, WebStorage).

Simple command-line use examples:

```
    npm install -g swarm-client
    swarm-client --connect ws://localhost:8080 --db test_db \
        --ssn user~ssn --repl
    > new Swarm.Model({a:1});
    { _id: "8V7N8+user~ssn",
      _version: "8V7N8+user~ssn",
      a: 1 }
```

swarm-client --connect ws://localhost:8080 --db test_db \
    --ssn user~ssn connect_and_run_the_script.js

API use example:

    var SwarmClient = require('swarm-client');

    var swarm = new SwarmClient({
        user_id: 'joe',
        db_id:   'db',
        connect: 'ws://server.com:1234/swarm',
        callback: onConnected
    });

    function onConnected (err) {
        // rehydrate, subscribe, rerender, etc etc
        var obj = swarm.get('/Type#id', onObjectLoad);
    }

    function onObjectLoad () {
        // the data is live
    }


for working examples, see the `swarm-examples` package.
for server-side daemon, see `swarm-server`.
