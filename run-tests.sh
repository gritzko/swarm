#!/bin/bash

clear;

if [ ! -d node_modules ]; then
    npm install || (echo install npm && exit 1);
fi

for f in `ls test/*_*.js`; do
    node_modules/nodeunit/bin/nodeunit $f; 
done
