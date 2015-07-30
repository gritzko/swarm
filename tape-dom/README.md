# DOM output formatter for tape tests

Tape is an [NPM package](https://www.npmjs.com/package/tape) for
making [Test Anything Protocol](https://testanything.org/) tests in node.js.
Tape nicely runs in a browser using browserify.

This minimal package converts tape's TAP output to nicely formatted
DOM.

Isomorphic use:

    var tape = require('tape');

    if (typeof(window)==='object') {
        var tape_dom = require('tape-dom');
        tape_dom(tape);
    }

Then `browserify my_js_test.js -o browserified_test.js`

The HTML side:

    <html>
    <head>
        <title>tape-dom example</title>
        <link rel="stylesheet"
            href="../node_modules/tape-dom/tape.css">
    </head>
    <body>
        <script src="browserified_test.js"></script>
    </body>
    </html>
