# BAT - beat the bugs out of your apps

Stream-based [blackbox testing][bbt] toolkit.

BAT feeds the prescribed input into a stream, then listens to the
output and compares it to the expected value.
The package features:

* loopback stream implementation to test everything stream-based (BatStream),
* dummy server implementation to test server behavior (BatServer),
* stream multiplexer to emulate multiple clients (BatMux),
* and a tester that feeds input into a stream, then compares the
  response to the expected value (StreamTest).

see test/ for usage examples.

The package registers loopback stream and server to the
[stream-url][su] package under the protocol name 'loopback'.
Also, BatMux reads stream URLs from the input to initiate
arbitrary outgoing streams using stream-url.
So, the way to test a TCP server in a multiple client
configuration is:


    [StreamTest] <-trunk-stream-> [BatMux] <-tcp-stream1-> TCP Server
                                           <-tcp-stream2->


[bbt]: https://en.wikipedia.org/wiki/Black-box_testing
[su]: https://www.npmjs.com/package/stream-url
