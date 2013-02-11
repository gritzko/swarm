#!/bin/bash

clear

node ./test/basic.js 8001 &
pid1=$!
sleep 1

node ./test/basic.js 8002 8001 &
pid2=$!

sleep 1

kill $pid1
kill $pid2
