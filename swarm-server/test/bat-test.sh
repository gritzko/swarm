#!/bin/bash

cd "$( dirname "${BASH_SOURCE[0]}" )"
TEST_DIR=../../protocol-docs/test
SWARM=../cli.js
#BAT=bat
BAT=../../swarm-bat/bat-cli.js
#if ! which bat; then
#    BAT=../../swarm-bat/bat-cli.js
#fi
DB=test-R

rm -rf $DB
echo CREATE DB
$SWARM -C $DB \
    --oDBIdScheme 172 \
    --oClock "Logical" \
    --oClockLen 5
$SWARM -A $DB -s
echo 1 | $SWARM -U $DB -a testusr
echo BASIC PEER TESTS
$BAT $JSON -e "$SWARM -R $DB -l" $TEST_DIR/peer-basic.batt
