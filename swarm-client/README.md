# Swarm: browser client

A Swarm sync client.
Use dependency injection for any particular storage or transport method (LevelUP and stream-url based, respectively).


API use example:

    var SwarmClient = require('swarm-client');
    require('stream-url-ws');

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
for a server-side daemon, see `swarm-server`.
