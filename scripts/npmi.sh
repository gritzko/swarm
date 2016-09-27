#!/bin/bash
echo npm istall deps for all swarm-* packages
PACKAGES=`ls -d swarm-*`
for PACK in $PACKAGES; do
    cd $PACK
    npm i
    cd -
done
