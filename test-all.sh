#!/bin/bash

PACKAGES="bat stamp syncable replica"

for P in $PACKAGES; do

    cd $P

    if [ ! -d node_modules ]; then
        mkdir node_modules
        for p in $PACKAGES; do
            if [ "$p" != "$P" ]; then
                ln -s ../../$p node_modules/swarm-$p
            fi
        done
    fi

    npm install

    if ! npm test; then
        echo TEST ALL FAIL; exiting
        exit 1
    fi

    cd ..

done

echo TEST ALL OK
