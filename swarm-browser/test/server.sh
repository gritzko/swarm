#!/bin/sh

SERVER="node ../../swarm-server/src/cli.js"
# SERVER=swarm-server

if webpack test.js bundle.js ; then
    $SERVER -l ws://localhost:10000 -d test --repl -D -p test.db/
    echo Now, please open swarm/swarm-browser/test/index.html in the browser
fi

# optionally, command line swarm client as
# swarm-cli -c ws://localhost:10000 -d test -s alice~2 --repl -D
