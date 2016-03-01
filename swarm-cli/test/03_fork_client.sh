#!/bin/bash

# clone
$swarm server.db --fork client.db --clone
$swarm client.db --dump $TYPEID
echo "Swarm.get($TYPEID).set({b:2})" | $swarm client.db --repl
# sync
$xtalk "$swarm server.db --std" "$swarm client.db --std up --push"
$swarm client.db --dump $TYPEID
$swarm server.db --dump $TYPEID
# create
$swarm clone.db
$xtalk "$swarm server.db --std" "$swarm clone.db --std up"
$swarm clone.db --dump $TYPEID
# pump 1mln ops
cat $OPS | awk '{print "'$TYPEID'"$0}' > pump.txt
$swarm clone.db --std < pump.txt
$swarm clone.db --dump $TYPEID
$xtalk "$swarm server.db --std" "$swarm empty.db --std up --push"
$swarm server.db --dump $TYPEID
$xtalk "$swarm server.db --std" "$swarm clone.db --std up --sync"
$swarm client.db --dump $TYPEID
