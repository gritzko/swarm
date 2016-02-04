#!/bin/bash

cd `dirname $0`
SCRIPT_DIR=$PWD
cd -

swarm="node $SCRIPT_DIR/../src/cli.js"
xtalk=$SCRIPT_DIR/../../scripts/xtalk.sh
DIR=.cli-test-01
OPS=$PWD/ops.txt

rm -rf $DIR && mkdir $DIR && cd $DIR

# create/write/dump
$swarm server.db --create bash1 --DClock LamportClock --DHomeHost true  || exit 1
# direct access
$swarm server.db -a || exit 2
$swarm server.db -a .off -P xoxo   || exit 3
( $swarm server.db -a .off | grep xoxo > /dev/null )  || exit 4
$swarm server.db -a .off -E   || exit 5
( $swarm server.db -a .off | grep xoxo ) && exit 6
# print db stats
$swarm server.db --stats   || exit 7
( $swarm server.db -r -D -v > typeid.txt ) <<EOF
    Swarm.Host.localhost.on('echo', function(ev){
        console.log('echo', ev.version);
    });
    var model=new Swarm.Model({a:1});
    console.log('TYPEID', model.typeid());
    model.set({b:2});
EOF
# evil genius perl
#TYPEID=`awk '{gsub(/'"'"'/,"", $1); print $1;}' typeid.txt`
export TYPEID=`perl -ne '/TYPEID\s+(\/\w+#\w+\+\w+)/ && print "$1\n"' typeid.txt`
if [[ ! $TYPEID ]]; then exit 9; fi
(grep 'js:' typeid.txt > /dev/null) && cat typeid.txt && exit 13;
echo our object is $TYPEID
grep echo typeid.txt || exit 10
( $swarm -a -- server.db | grep LamportClock ) || exit 11
cat > correct.txt <<EOF
/Model#00003+swarm!00003+swarm.~state	{"00003+swarm":{"a":1}}
/Model#00003+swarm!00004+swarm.set	{"b":2}
/Model#00003+swarm.~meta	l:00004+swarm b:00003+swarm
EOF
$swarm server.db -a "$TYPEID" > fact.txt
diff correct.txt fact.txt || exit 12
exit 0

##   01_stdio

##   02_forks

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
