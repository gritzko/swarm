#!/bin/bash

if [ ! $REPO ]; then
    REPO=https://github.com/gritzko/swarm.git
fi
TEST_ROOT=`tempfile -d ~/tmp -p swrm_`

rm -rf $TEST_ROOT
mkdir -p $TEST_ROOT
cd $TEST_ROOT
git clone $REPO
cd swarm

export PATH=$NODE_HOME/bin:/bin:/usr/bin

node -v
npm -v

#if ! npm test; then
#    echo
#    echo something happened
#    echo
#    read
#fi

make bootstrap

if [ $LOOP ]; then
    pwd
    ls
    env
    ./scripts/forever-test.sh
    read
else
    make test || (echo FAIL; read)
fi


