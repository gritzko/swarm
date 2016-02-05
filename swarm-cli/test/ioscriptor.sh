#!/bin/bash

if [[ ! $SWARM ]]; then
    SWARM=`which swarm`
    if [[ ! -e $SWARM ]]; then
        echo "no swarm executable found"
        exit 1
    fi
fi

SCRIPT_DIR=$1
if [[ ! -d $SCRIPT_DIR ]]; then
    echo "specify the scripts dir"
    exit 2
fi

DB=.`basename $SCRIPT_DIR`.db
rm -rf $DB
$SWARM $DB --create bash2 --DClock LamportClock --DSnapshotSlave on  || exit 1

SCRIPTS=`ls $SCRIPT_DIR/*.in.txt`

for input in $SCRIPTS; do
    base=$SCRIPT_DIR/`basename $input .in.txt`
    fact=$base.fact.txt
    log=$base.log.txt
    correct=$base.out.txt
    diff=$base.diff

    if ! $SWARM $DB --std > $fact 2> $log < $input; then
        echo cli crashed
        exit 2
    fi
    if diff -wU2 $correct $fact > $diff; then
        echo $base OK
    else
        echo $base FAIL
        cat $log
        echo ---
        cat $diff
        exit 1
    fi
done

rm -rf $DB
rm $SCRIPT_DIR/*.log.txt
rm $SCRIPT_DIR/*.diff
rm $SCRIPT_DIR/*.fact.txt
