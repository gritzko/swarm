#!/bin/bash

clear;

if [ ! -d node_modules ]; then
    npm install || (echo install npm && exit 1);
fi

node_modules/nodeunit/bin/nodeunit test/testSpec.js

