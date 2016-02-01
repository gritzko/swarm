#!/bin/bash

cd `dirname $0`
SCRIPT_DIR=$PWD
cd -

swarm="node $SCRIPT_DIR/../src/cli.js"
xtalk=$SCRIPT_DIR/../../scripts/xtalk.sh
DIR=.cli-tests
OPS=$PWD/ops.txt

rm -rf $DIR && mkdir $DIR && cd $DIR

# create/write/dump
$swarm --home server.db --create test --DClock LamportClock   || exit 1
# direct access
$swarm --home server.db -a   || exit 2
$swarm --home server.db -a .off -P xoxo   || exit 3
( $swarm --home server.db -a .off | grep xoxo > /dev/null )  || exit 4
$swarm --home server.db -a .off -E   || exit 5
( $swarm --home server.db -a .off | grep xoxo ) && exit 6
# print db stats
$swarm --home server.db --stats   || exit 7
exit 0
echo "console.log(new Swarm.Model({a:1}).typeid())" | $swarm -h server.db -r > id
$swarm --home server.db --dump $TYPEID
# clone
$swarm --home server.db --fork client.db --clone
$swarm --home client.db --dump $TYPEID
echo "Swarm.get($TYPEID).set({b:2})" | $swarm --home client.db --repl
# sync
$xtalk "$swarm -h server.db --std" "$swarm -h client.db --std up --push"
$swarm --home client.db --dump $TYPEID
$swarm --home server.db --dump $TYPEID
# create
$swarm --home clone.db
$xtalk "$swarm -h server.db --std" "$swarm -h clone.db --std up"
$swarm --home clone.db --dump $TYPEID
# pump 1mln ops
cat $OPS | awk '{print "'$TYPEID'"$0}' > pump.txt
$swarm --home clone.db --std < pump.txt
$swarm --home clone.db --dump $TYPEID
$xtalk "$swarm -h server.db --std" "$swarm -h empty.db --std up --push"
$swarm --home server.db --dump $TYPEID
$xtalk "$swarm -h server.db --std" "$swarm -h clone.db --std up --sync"
$swarm --home client.db --dump $TYPEID
