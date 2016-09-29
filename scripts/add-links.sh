#!/bin/bash
echo cross-symlinks to working tree versions of swarm packages
ROOT=`pwd`
PACKAGES="swarm-bat swarm-protocol swarm-syncable swarm-cli swarm-peer swarm-server swarm-browser swarm-gw"
DEPS=""
for PACK in $PACKAGES; do
    cd $PACK
    if [ ! -e node_modules ]; then
        mkdir node_modules;
    fi
    cd node_modules
    for LINK in $DEPS; do
        if [ ! -e $LINK ]; then
            ln -s $ROOT/$LINK $LINK
        else
            echo $PACK already has $LINK
        fi
    done
    DEPS="$DEPS $PACK"
    cd ..
    cd ..
done
