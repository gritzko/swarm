/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 * To change this template use File | Settings | File Templates.
 */
if (require) {
    var swarm = require('../lib/swarm2.js');
    Spec = swarm.Spec;
}

exports.testTs = function (test) {
    var ts1 = Spec.ts(), ts2, i=0;
    var iv = setInterval(function(){
        ts2 = Spec.ts();
        if (ts2<=ts1)
            console.error(ts2,'<=',ts1);
        test.ok(ts2>ts1);
        ts1 = ts2;
        if (++i==1000) {
            test.done();
            clearInterval(iv);
        }
    }, 1);
}

exports.testSpec = function (test) {
    var testSpec = '/Class#ID.field!130811192632&gritzko+1111';
    var spec = new Spec(testSpec);
    test.equal(spec.time,'130811192632');
    test.equal(spec.ssn,'1111');
    var rev = spec.toString();
    test.equal(rev,testSpec);
    var time = '130811192020';
    var iso = Spec.digits2iso(time);
    var date = new Date(iso);
    test.equal(date.getMonth(),7); // zero based
    test.equal(date.getSeconds(),20);
    test.done();
}

exports.testBase = function (test) {
    var obj = {
        '_vid': {
            text:   '!130811192020&gritzko+iO',
            number: '!130811192021&gritzko+iO',
            obj:    '!130811192021222&aleksisha',
            smth:   '!130810192021999&oldmf'
        },
        text: 'test',
        number: 123,
        obj: {},
        smth: 1
    };
    var base = Spec.getBase(obj);
    test.deepEqual(base,{
            '&_':'!130811182021',
            '&gritzko+iO':'!130811192021',
            '&aleksisha':'!130811192021222'
    });
    obj.smth = 4;
    var nts = '!130811192028&gritzko+iO';
    obj['_vid'].smth = nts;
    var diff = Spec.getDiff(base,obj);
    test.equal(diff.smth,4);
    test.equal(diff['_vid'].smth, nts);
    test.done();
}

