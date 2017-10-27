#!/usr/bin/env bash
NODE=`which node`
echo $NODE && $NODE -v
cd "$( dirname "${BASH_SOURCE[0]}" )"
TEST_DIR=../../protocol-docs/test
SWARM="$NODE ../src/swarm"
#BAT=bat
BAT="$NODE ../../swarm-bat/bat-cli.js"
#if ! which bat; then
#    BAT=../../swarm-bat/bat-cli.js
#fi
DB=./test+R

rm -rf $DB
echo CREATE DB

$SWARM create \
    --scheme 172 \
    --logical \
    --clocklen 5 \
    $DB \
    || exit 1

echo SCAN
$SWARM db $DB || exit 2

echo CREATE USER
$SWARM user --id 0testusr --password 1 $DB || exit 3

echo BASIC PEER TESTS
$BAT -e "$SWARM run -D -l std: $DB" $TEST_DIR/peer-basic.batt || exit $?
