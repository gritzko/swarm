# BAT - batter the bugs out of your apps

Simplistic line-based [blackbox testing][bbt] tool.

BAT feeds the prescribed input into a stream, then listens to the
output and compares it to the expected value.
The [test script format](batt.md) is extremely simple:

    ; comment
    >input
    <expected output

[bbt]: https://en.wikipedia.org/wiki/Black-box_testing

## Usage

    bat -e command simple_script.batt
    bat -c host:port multistream_script.batt
    bat -l 127.0.0.1:12345 server_script.batt
    bat -e new_version -r new_script.batt old_script.batt
    command | bat expected_output.batt -W

see test/ for more examples.

## Options

    -e test an executable (stdin/stdout)
    -c connect by tcp to a host/port
    -w connect by WebSocket to a host/port
    -r record de-facto output to a new test script
    -x don't stop on errors, just log them
    -v comment on every step
    -W ignore whitespace
    -L ignore empty lines
    -C ignore case
    -d mandatory delay (let'em think); default 10ms
    -D mismatch delay (wait, they're still thinking); default 100ms
    -O output may go in any order

## Codes

    0 OK
    1 no match
    2 script error
    3 argument error
    4 io error


## TODO

[C version](https://github.com/gritzko/bat) for billion-line tests


