# BAT - batter the bugs out of your apps

BAT is a simplistic [blackbox testing][bbt] tool. BAT is:

* stream-based (TCP, WebSocket or local pipes, no HTTP),
* line-based (like classic internet/Unix protocols, no JSON, no XML),
* implementation-agnostic (just i/o, no API calls).

BAT feeds the prescribed input into a stream, then listens to the
output and compares it to the expected value.
The [test script format](batt.md) is extremely simple:

    ; comment
    >input
    <expected output

BAT's predecessors have been extremely useful in testing network servers
in concurrent input/output scenarios. Then, the testing tool pretends to
be several clients:

    ; client 1 says hi, server responds
    client1> Hello
    client1< Hi Joe
    ; client 2 joins
    client2> Hello
    client2< Hi Mike

Blackbox testing is particularly handy when you test protocol compliance
of several implementations: their APIs differ, but tests are the same.

[bbt]: https://en.wikipedia.org/wiki/Black-box_testing

## Usage

- [x]     bat -e command simple_script.batt
- [ ]     bat -c host:port multistream_script.batt
- [ ]     bat -l 127.0.0.1:12345 server_script.batt
- [ ]     bat -e new_version -r new_script.batt old_script.batt
- [ ]     command | bat expected_output.batt -W

see test/ for examples of [API](test/00_parse_format.js) and
[CLI](test/cli-test.sh) usage, [.batt](test/bash.batt) scripts.

## Options

- [x] -e test an executable (stdin/stdout)
- [ ] -c connect by tcp to a host/port
- [ ] -w connect by WebSocket to a host/port
- [ ] -r record de-facto output to a new test script
- [x] -x don't stop on errors, just log them
- [ ] -v comment on every step
- [ ] -L ignore empty lines
- [x] -C ignore case
- [ ] -d mandatory delay (let'em think); default 10ms
- [ ] -D mismatch delay (wait, they're still thinking); default 100ms
- [x] -O output lines may go in any order
- [x] --whitespace collapse|ignore|exact|count

## Codes

- [ ]     0 OK
- [ ]     1 no match
- [ ]     2 script error
- [ ]     3 argument error
- [ ]     4 io error


## TODO

[C version](https://github.com/gritzko/bat) for billion-line tests


