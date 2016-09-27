#!/bin/bash
echo cross-symlinks to working tree versions of swarm packages
ROOT=`pwd`
PACKAGES=`ls -d swarm-*`
for PACK in $PACKAGES; do
    cd $PACK
    if [ ! -e node_modules ]; then
        mkdir node_modules;
    fi
    cd node_modules
    for LINK in $PACKAGES; do
        if [ ! -e $LINK ]; then
            ln -s $ROOT/$LINK $LINK
        fi
    done
    cd ..
    cd ..
done
