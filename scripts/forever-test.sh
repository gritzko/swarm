#!/bin/bash

COUNT=0

while make test; do
    COUNT=$((COUNT+1))
    echo
    echo -e "\e[92m\e[4m $COUNT runs OK                                                  \e[24m \e[39m"
    echo
done

echo -e "\e[91mrun $COUNT fails\e[39m"
