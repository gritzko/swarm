#!/bin/bash

cd `dirname $0`
SCRIPT_DIR=$PWD
cd -

swarm="node $SCRIPT_DIR/../src/cli.js"
xtalk=$SCRIPT_DIR/../../scripts/xtalk.sh
DIR=.cli-test-02
OPS=$PWD/ops.txt

rm -rf $DIR && mkdir $DIR && cd $DIR
# create/write/dump
$swarm server.db --create bash2 --DClock LamportClock --DSnapshotSlave true  || exit 1

$swarm server.db --std > fact.txt <<EOF
/Client+Swarm#bash2!0.on 

/Model#00003+1.on 
    !00003+1.~state   {"a":1}
/Model#00004+1.on 
    !00004+1.~state   {"a":2}
EOF

cat > correct.txt <<EOF
/Client+Swarm#bash2!00004+1.on 
    !0.Clock LamportClock

#00003+1   !00003+1

#00004+1   !00004+1

/Client+Swarm#bash2!00004+1.off
EOF

diff -wU2 correct.txt fact.txt || exit 1
