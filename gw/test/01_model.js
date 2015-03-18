"use strict";
var Swarm = require("../../"); // FIXME multipackage
var Gateway = require("../");
var Spec = Swarm.Spec;

var storage = new Swarm.Storage(false);
var host = Swarm.env.localhost= new Swarm.Host('gritzko',0,storage);

var Color = Swarm.Model.extend ("Color", {
    defaults: {
        rgb: '',
        name: ''
    }
});

test('1.a basic on/off', function (test) {
    var purple = new Color({rgb:"800080"});
    var gw = new Gateway(host);
    expect(4);
    var spec = gw.ON('Color', purple._id, function (ev) {
        equal(ev.name,'init');
        ok(ev.value);
        equal(ev.value.rgb,'800080');
    });
    ok(spec==purple.spec());
});

test('1.b set', function (test) {
    var gw = new Gateway(host);
    var id = gw.ON('Color', 'rgb_blue', function(){});
    var obj = host.get(new Spec(id).filter('/#'));
    var spec = gw.SET(id, {rgb:'0000ff'});
    equal(obj.rgb, '0000ff');
    equal('!'+spec.version(),obj._version);
    equal(spec.id(),obj._id);
});

test('1.c submit and listen', function (test) {
    var gw = new Gateway(host);
    expect(4);
    var spec = gw.SUBMIT("Color", {
        rgb: "ffffff"
    }, function (ev) {
        if (ev.name==='init') {
            deepEqual(ev.value,{
                name: "",
                rgb:'ffffff'
            });
        } else {
            equal(ev.name, 'set');
            ok(ev.value);
            equal(ev.value.name, "white");
        }
    });
    var id = new Spec(spec).id();
    gw.host.deliver(new Spec(spec.filter('/#')+"!"+gw.host.clock.issueTimestamp()+".set"), {
        name: "white"
    });
});
