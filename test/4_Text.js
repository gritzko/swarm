/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 */
if (typeof require == 'function') {
    Swarm = require('../lib/swarm3.js');
    require('../lib/swarm3-text.js');
}
Spec = Swarm.Spec;
Model = Swarm.Model;
Field = Swarm.Field;
Set = Swarm.Set;
Text = Swarm.Text;
diff = Swarm.diff;

test('4._ diff', function (test){
    var eq = diff('same','same');
    deepEqual(eq,[['=','same']]);
    var ch = diff('was','now');
    deepEqual(ch,[['+','now'],['-','was']]);
    var mid = diff('muddle','middle');
    deepEqual(mid,[['=','m'],['+','i'],['-','u'],['=','ddle']]);
});

var storage = new DummyStorage(false);
var host = Swarm.localhost = new Swarm.Host('gritzko',0,storage);
host.availableUplinks = function () {return [storage]};

test('4.a init', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;

    var text = new Text(), op;
    text.set('test');
    equal(text.text,'test');
});

test('4.b in rm', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;

    var text = new Text(), op;

    text.set("test");
    text.set("tet");
    text.set("text");

    equal(text.text,'text');
    equal(text.weave,'\ntexs\u0008t');
    
    text.set('terminator model t');
    equal(text.text,'terminator model t');
});

test('4.c concurrent insert', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;

    var text = new Text('ALE'), op;
    var eid = text.ids[2];
    var spec = text.spec();
    text.deliver ( new Spec("/Text#ALE!00001+gritzko.insert"), { '00000+swarm': 'a' });
    text.deliver ( new Spec("/Text#ALE!00003+gritzko~1.insert"), { '00001+gritzko' : 'l' });
    text.deliver ( new Spec("/Text#ALE!00002+gritzko~2.insert"), { '00001+gritzko' : 'e' });
    equal(text.text,'ale');


});
