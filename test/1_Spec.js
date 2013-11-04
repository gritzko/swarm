/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 * To change this template use File | Settings | File Templates.
 */
if (typeof(require)==='function') {
    var swarm = require('../lib/swarm2.js');
    Spec = swarm.Spec;
    Swarm = swarm.Swarm;
}

new Swarm('gritzko');

asyncTest('timestamp sequence test', function () {
    expect(100);
    var ts1 = Spec.newVersion(), ts2, i=0;
    var iv = setInterval(function(){
        ts2 = Spec.newVersion();
        if (ts2<=ts1)
            console.error(ts2,'<=',ts1);
        ok(ts2>ts1);
        ts1 = ts2;
        if (++i==100) {
            start();
            clearInterval(iv);
        }
    }, 0);
});

test('basic specifier syntax', function (test) {
    var testSpec = '/Class#ID.field!20130811192632+gritzko';
    var spec = new Spec(testSpec);
    equal(spec.version,'20130811192632+gritzko');
    equal(Spec.ext(spec.version),'gritzko');
    var rev = spec.toString();
    equal(rev,testSpec);
    /*var time = '20130811192020';
    var iso = Spec.timestamp2iso(time);
    var date = new Date(iso);
    test.equal(date.getMonth(),7); // zero based
    test.equal(date.getSeconds(),20);*/
    var spec2 = new Spec(spec);
    equal(spec.toString(),spec2.toString());
});


/*exports.testBase = function (test) {
    var obj = {
        '_vid': {
            text:   '!20130811192020&gritzko+iO',
            number: '!20130811192021&gritzko+iO',
            obj:    '!20130811192021+222&aleksisha',
            smth:   '!2013081019202+999&oldmf'
        },
        text: 'test',
        number: 123,
        obj: {},
        smth: 1
    };
    var base = Spec.getBase(obj);
    test.deepEqual(base,{
            '_':'20130811182021',
            'gritzko+iO':'20130811192021',
            'aleksisha':'20130811192021+222'
    });
    obj.smth = 4;
    var nts = '!20130811192028&gritzko+iO';
    obj['_vid'].smth = nts;
    var diff = Spec.getDiff(base,obj);
    test.equal(diff.smth,4);
    test.equal(diff['_vid'].smth, nts);
    test.done();
}*/

