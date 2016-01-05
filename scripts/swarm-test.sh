#!/bin/bash

# to start a testing run, use something like this:
# LOOP=1 REPO=~/Projects/swarm whatever/swarm/scripts/swarm-test.sh 

# please don't forget to provide paths to your node installs:
NODES=(  "/opt/node-v0.10.41-linux-x64" "/opt/node-v0.11.16-linux-x64" "/opt/node-v5.1.1-linux-x64" "/opt/node-v4.2.3-linux-x64" )

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

for node in "${NODES[@]}"; do
    LOOP=$LOOP NODE_HOME=$node REPO=$REPO gnome-terminal -e $DIR/clean-test.sh  &
done
