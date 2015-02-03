"use strict";

var testrunner = require("qunit");

function onTest (err, report) {
    if (report.failed) {
        process.exit(1);
    }
    if (err) {
        console.warn(err);
        console.warn(err.stack);
        process.exit(-1);
    }
}

testrunner.setup({
    //coverage: true,
    maxBlockDuration: 10000
});

testrunner.run({
    code: "lib/IdArray.js",
    tests: "test/0A_IdArray.js"
}, onTest);

testrunner.run({
    code: "lib/Spec.js",
    tests: "test/01_Spec.js"
}, onTest);

testrunner.run({
    code: "lib/Syncable.js",
    deps: [
        "lib/Spec.js",
        "lib/Model.js",
        "lib/Host.js",
        "lib/Set.js",
        "lib/Storage.js"
    ],
    tests: "test/02_EventRelay.js"
}, onTest);

testrunner.run({
    code: "lib/Pipe.js",
    deps: [
        "lib/Spec.js",
        "lib/Host.js",
        "lib/Set.js",
        "lib/Storage.js",
        "lib/AsyncLoopbackConnection.js"
    ],
    tests: "test/03_OnOff.js"
}, onTest);

testrunner.run({
    code: "lib/Text.js",
    deps: [
        "lib/Spec.js",
        "lib/Host.js",
        "lib/Storage.js"
    ],
    tests: "test/04_Text.js"
}, onTest);

testrunner.run({
    code: "lib/LongSpec.js",
    deps: [
        "lib/Spec.js"
    ],
    tests: "test/05_LongSpec.js"
}, onTest);

testrunner.run({
    code: "lib/Host.js",
    deps: [
        "lib/Spec.js",
        "lib/Set.js",
        "lib/Storage.js",
        "lib/Pipe.js",
        "lib/Model.js"
    ],
    tests: "test/06_Handshakes.js"
}, onTest);

testrunner.run({
    code: "lib/Vector.js",
    deps: [
        "lib/Spec.js",
        "lib/Model.js",
        "lib/Storage.js"
    ],
    tests: "test/07_Vector.js"
}, onTest);

testrunner.run({
    code: "lib/FileStorage.js",
    tests: "test/08_FileStorage.js"
}, onTest);

testrunner.run({
    code: "lib/LevelStorage.js",
    tests: "test/09_LevelStorage.js"
}, onTest);
