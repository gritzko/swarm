#!/bin/bash
echo Replaces npm-installed swarm packages with symlinks to
echo working tree versions of those.
DEPS=`ls -d swarm-*/node_modules/swarm-*`
for DEP in $DEPS; do
    PACKAGE=$(basename $DEP)
    if [ -d $PACKAGE ]; then
        echo relinking $DEP
        rm -rf $DEP
        ln -s $PWD/$PACKAGE $PWD/$DEP
    fi
done
