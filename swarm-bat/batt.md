# Swarm protocol tests

These tests have an objective of:

* basic case coverage for the protocol syntax and
* providing examples.

Every Swarm implementation is expected to read and write all the
listed cases correctly.

## BATT format

The format is a rather simplistic one.  It does blackbox testing
of line-based input/output, so `batt` script syntax is as close
to plain text file as possible:

* comment lines start with `;`
* input lines start with `>`
* expected output lines start with `<` or nothing (default)
* in case of multiple input/output streams, marks are extended to
    * `stream_id>` for input and
    * `stream_id<` for output (base64 ids).

The test runner reads a `.batt` file line by line, so

1. input lines are sent to the tested program
2. output lines are expected to be read from the program,
3. previously unseen stream ids trigger new stream creation.

Normally, "streams" are TCP connections to a certain host/port
where the tested program is listening. Single stream test cases
can run using stdin/stdout.  For example, a simple test case
for the `cat` command:

    ; echoes a string
    >test
    <test
    ; echoes an empty string
    >

    ; echoes two lines
    >one
    >two
    one
    <two
