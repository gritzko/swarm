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
$swarm server.db --create test --DClock LamportClock --DHomeHost true  || exit 1
# direct access
$swarm server.db -a   || exit 2
$swarm server.db -a .off -P xoxo   || exit 3
( $swarm server.db -a .off | grep xoxo > /dev/null )  || exit 4
$swarm server.db -a .off -E   || exit 5
( $swarm server.db -a .off | grep xoxo ) && exit 6
# print db stats
$swarm server.db --stats   || exit 7
echo "new Swarm.Model({a:1}).typeid()" > newobj.txt
( cat newobj.txt | $swarm server.db -r > typeid.txt ) || exit 8
# evil genius perl
#TYPEID=`awk '{gsub(/'"'"'/,"", $1); print $1;}' typeid.txt`
TYPEID=`perl -ne '/(\/\w+#\w+\+\w+)/ && print "$1\n"' typeid.txt`
if [[ ! $TYPEID ]]; then exit 9; fi
echo our object is $TYPEID
exit 0
$swarm server.db --dump $TYPEID
# clone
$swarm server.db --fork client.db --clone
$swarm client.db --dump $TYPEID
echo "Swarm.get($TYPEID).set({b:2})" | $swarm client.db --repl
# sync
$xtalk "$swarm server.db --std" "$swarm client.db --std up --push"
$swarm client.db --dump $TYPEID
$swarm server.db --dump $TYPEID
# create
$swarm clone.db
$xtalk "$swarm server.db --std" "$swarm clone.db --std up"
$swarm clone.db --dump $TYPEID
# pump 1mln ops
cat $OPS | awk '{print "'$TYPEID'"$0}' > pump.txt
$swarm clone.db --std < pump.txt
$swarm clone.db --dump $TYPEID
$xtalk "$swarm server.db --std" "$swarm empty.db --std up --push"
$swarm server.db --dump $TYPEID
$xtalk "$swarm server.db --std" "$swarm clone.db --std up --sync"
$swarm client.db --dump $TYPEID
