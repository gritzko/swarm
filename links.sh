#!/bin/bash

PACKAGES="test-bat"

for PACK in $PACKAGES; do
    if [ ! -e node_modules/$PACK ]; then
        echo linking $PACK
        ln -s ../$PACK node_modules/$PACK
    fi
done
