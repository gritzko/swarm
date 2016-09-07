#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )"
TEST_DIR=../../protocol-docs/test
SWARM=../cli.js
BAT=bat
if ! which bat; then
    BAT=../../swarm-bat/bat-cli.js
fi

rm -rf test-XY

$SWARM -C test-XY

$BAT -e "$SWARM -R test-XY -l" $TEST_DIR/peer-basic.batt
