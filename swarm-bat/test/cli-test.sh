#!/bin/bash
BAT=../bat-cli.js

echo simply run bash, execute commands, test the output
$BAT -i -e bash bash.batt

#echo run TCP client, TCP server
#$BAT -l tcp://localhost:12345 server.batt
#$BAT -c tcp://localhost:12345 client.batt
