#!/bin/bash

PACKAGES="loopback-stream then-make"

for PACK in $PACKAGES; do
    echo linking $PACK
    if [ -e node_modules/$PACK ]; then
        ## no -rf to make sure it only removes links
        rm node_modules/$PACK;
    fi
    ln -s ../$PACK node_modules/$PACK
    find ./*/node_modules/ -name $PACK -printf "warning: %f at %h"
done
