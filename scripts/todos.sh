#!/bin/bash
echo -e \\n========== TO\DOs ==========\\n
grep -n -E 'TO\DO|FIX\ME' swarm-*/src/*.js
echo -e \\n========== NEW TO\DOs ==========\\n
git diff | grep '^+' | grep -E 'TO\DO|FIX\ME'
