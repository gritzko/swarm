#!/bin/bash
cd "$( dirname "${BASH_SOURCE[0]}" )"
NODE=`which node`
echo $NODE && $NODE -v
BAT="$NODE ../bat-cli.js"

echo == simply run bash, execute commands, test the output ==
$BAT -i -e bash bash.batt

echo == run TCP client, TCP server ==
URL=tcp://localhost:12345
$BAT -l $URL -e "$BAT -c $URL client.batt" server.batt
