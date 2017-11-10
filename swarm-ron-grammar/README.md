# Regex parsers for the Replicated Object Notation

see protocol docs at
    https://github.com/gritzko/ron

use:
```
> const RON=require('swarm-ron-grammar');
> RON.OP.exec('#time-orig`:loc=1"str"')
[ '#id`:l=1"str"',
  '',
  'time-orig',
  '`',
  'loc',
  '=1"str"',
  index: 0,
  input: '#id`:l=1"str"' ]
```
