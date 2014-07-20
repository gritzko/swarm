var testrunner = require("qunit");

function onTest (err, report ){
    if (err) {
        console.dir(err);
        console.dir(err.stack);
        process.exit(1);
    } else {
        //console.dir(report);
    }
}

testrunner.run([
    {    
        code: "lib/swarm3.js",
        tests: "test/1_Spec.js"
    },
    {    
        code: "lib/swarm3.js",
        deps: ["test/0_routines.js"],
        tests:  [ "test/2_EventRelay.js", "test/3_OnOff.js" ]
    }
], onTest);

