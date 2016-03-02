#!/bin/bash

cd `dirname $0`
SCRIPT_DIR=$PWD
cd -

swarm="node $SCRIPT_DIR/../src/cli.js"
xtalk=$SCRIPT_DIR/../../scripts/xtalk.sh
DIR=.cli-test-03

rm -rf $DIR && mkdir $DIR && cd $DIR


echo "+++ create db +++"
$swarm orig.db --create bash3 --DClock LamportClock --DHomeHost true || exit 1

echo "+++ init +++"
TYPEID="/Model#object"
$swarm orig.db --access "$TYPEID!1.~state" --put '{"1":{"a":"one"}}'
$swarm orig.db --access "$TYPEID!~.meta" --put 'l:1'
$swarm orig.db --get $TYPEID > planted.txt
cat > correct.txt <<EOF
{"a":"one"}
EOF
diff -U3 correct.txt planted.txt || exit 3

echo "+++ edit +++"
echo "Swarm.get('$TYPEID', function(){this.set({b:'two'})})" | $swarm orig.db --repl -v -D
$swarm orig.db --get $TYPEID | grep two || exit 4

echo "+++ fork (clone) +++"
$swarm orig.db --fork clone1.db --client clone || exit 5
$swarm clone1.db --get $TYPEID | grep two || exit 6

echo "+++ offline changes +++"
echo "Swarm.get('$TYPEID').set({c:'three'})" | $swarm clone1.db --repl
echo "Swarm.get('$TYPEID').set({a:'ONE'})" | $swarm orig.db --repl

echo +++ resync +++
$xtalk "$swarm orig.db --std" "$swarm clone1.db --std up --syncall"
$swarm orig.db --get $TYPEID > syncd-orig.txt
$swarm clone1.db --get $TYPEID > syncd-clone1.txt
diff -U3 syncd-orig.txt syncd-clone1.txt || exit 8
grep syncd-clone1.txt | grep ONE | grep three || exit 9

echo "+++ fork 2 +++"
$swarm orig.db --fork clone2.db --client clone || exit 10
echo "Swarm.get('$TYPEID').set({b:'TWO'})" | $swarm clone1.db --repl
echo "Swarm.get('$TYPEID').set({c:'THREE'})" | $swarm clone2.db --repl

echo "+++ merge +++"
$xtalk "$swarm orig.db --std" "$swarm clone1.db --std up --sync"
$xtalk "$swarm orig.db --std" "$swarm clone2.db --std up --sync"
$swarm clone1.db --get $TYPEID > syncd-1.txt
$swarm clone2.db --get $TYPEID > syncd-2.txt
diff syncd-1.txt syncd-2.txt || exit 12

cd .. && rm -rf $DIR
