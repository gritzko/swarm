var testrunner = require("qunit");

function onTest (err, report ){
    if (err) {
        console.warn(err);
        console.warn(err.stack);
        process.exit(1);
    } else {
        //console.dir(report);
    }
}

testrunner.run(
    {
        code: "lib/Spec.js",
        tests: "test/01_Spec.js"
    }
, onTest);

testrunner.run(
{
    code: "lib/Model.js",
    deps: [
        "lib/Spec.js",
        "lib/Host.js",
        "lib/Model.js",
        "lib/Set.js",
        "lib/Storage.js"
    ],
    tests: "test/02_EventRelay.js"
}, onTest);
