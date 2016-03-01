#!/bin/bash

cd `dirname $0`
SCRIPT_DIR=$PWD
cd -

swarm="node $SCRIPT_DIR/../src/cli.js"
xtalk=$SCRIPT_DIR/../../scripts/xtalk.sh
DIR=.cli-test-01
OPS=$PWD/ops.txt

rm -rf $DIR && mkdir $DIR && cd $DIR

echo +++ create/write/dump +++
$swarm server.db --create bash1 --DClock LamportClock --DHomeHost true  || exit 1
echo +++ direct access +++
$swarm server.db -a || exit 2
$swarm server.db -a .off -P xoxo   || exit 3
( $swarm server.db -a .off | grep xoxo > /dev/null )  || exit 4
$swarm server.db -a .off -E   || exit 5
( $swarm server.db -a .off | grep xoxo ) && exit 6
echo +++ print db stats +++
$swarm server.db --stats   || exit 7
echo +++ do some REPL +++
( $swarm server.db -r -D -v > typeid.txt ) <<EOF
    Swarm.Host.localhost.on('echo', function(ev){
        console.log('echo', ev.version);
    });
    var model=new Swarm.Model({a:1});
    console.log('TYPEID', model.typeid());
    model.set({b:2});
EOF
export TYPEID=`perl -ne '/TYPEID\s+(\/\w+#\w+\+\w+)/ && print "$1\n"' typeid.txt`
if [[ ! $TYPEID ]]; then exit 9; fi
(grep 'js:' typeid.txt > /dev/null) && cat typeid.txt && exit 13;
echo +++ our object is $TYPEID +++
grep echo typeid.txt || exit 10
( $swarm -a -- server.db | grep LamportClock ) || exit 11
cat > correct.txt <<EOF
/Model#00003+swarm!00003+swarm.~state	{"00003+swarm":{"a":1}}
/Model#00003+swarm!00004+swarm.set	{"b":2}
/Model#00003+swarm.~meta	l:00004+swarm b:00003+swarm
EOF
echo +++ all records +++
$swarm server.db -a "$TYPEID" > fact.txt
diff correct.txt fact.txt || exit 12
exit 0
