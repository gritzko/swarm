"use strict";
var Swarm = require("../../"); // FIXME multipackage
var Gateway = require("../");
var Spec = Swarm.Spec;
var Color = require('./00_types').Color;

Swarm.env.multihost = true;
var storage = new Swarm.Storage(false);
var host = Swarm.env.localhost= new Swarm.Host('gritzko',0,storage);


test('1.a basic on/off', function (test) {
    Swarm.env.localhost = host;
    var purple = new Color({rgb:"800080"});
    var gw = new Gateway(host);
    expect(4);
    var spec = gw.ON('Color', purple._id, function (ev) {
        equal(ev.name,'init');
        ok(ev.value);
        equal(ev.value.rgb,'800080');
    });
    ok(spec==purple.spec());
    Swarm.env.localhost = null;
});

test('1.b set', function (test) {
    Swarm.env.localhost = host;
    var gw = new Gateway(host);
    var id = gw.ON('Color', 'rgb_blue', function(){});
    var obj = host.get(new Spec(id).filter('/#'));
    var spec = gw.SET(id, {rgb:'0000ff'});
    equal(obj.rgb, '0000ff');
    equal('!'+spec.version(),obj._version);
    equal(spec.id(),obj._id);
    Swarm.env.localhost = null;
});

test('1.c submit and listen', function (test) {
    Swarm.env.localhost = host;
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
    gw.host.deliver(new Spec(spec.filter('/#')+"!"+gw.host.clock.issueTimestamp()+".set"), {
        name: "white"
    });
    Swarm.env.localhost = null;
});

test('1.d CSET', function (test) {
    var purple_pojo = {
        rgb: '800080',
        name: 'purple'
    };
    Swarm.env.localhost = host;
    var gw = new Gateway(host);
    gw.CSET('Color', 'purple', purple_pojo);
    var purple = host.get("/Color#purple");
    deepEqual(purple.toPojo(), purple_pojo);
    var maroon = new Color({
        rgb: '800000'
    });
    gw.CSET('Color', maroon._id, {name: 'maroon'});
    deepEqual(maroon.toPojo(), {
        rgb: '800000',
        name: 'maroon'
    });
});
