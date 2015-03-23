"use strict";
var Swarm = require("../.."); // FIXME multipackage
var Gateway = require("../");
var Model = Swarm.Model;
var Collection = Swarm.Collection;
var Types = require('./00_types');
var Color = Types.Color;
var Palette = Types.Palette;
var Spec = Swarm.Spec;

Swarm.env.multihost = true;
var storage = new Swarm.Storage(false);
var host = Swarm.env.localhost= new Swarm.Host('gritzko',0,storage);

var black_pojo = {
    rgb: '#000',
    name: 'black'
};
var white_pojo = {
    rgb: '#fff',
    name: 'white'
};

test('2.a basic on/off (+entries)', function (test) {
    Swarm.env.localhost = host;
    var mono = new Palette();
    mono.push(new Color(black_pojo));
    mono.push(new Color(white_pojo));
    var gw = new Gateway(host);
    expect(3);
    gw.ON('Palette', mono._id, function (ev) {
        equal(ev.name, 'load');
        equal(ev.target,mono);
        ev.value.forEach(function(pojo){delete pojo._id;});
        deepEqual(ev.value, [black_pojo, white_pojo]);
    });
    Swarm.env.localhost = null;
});

test('2.b insert/remove events, entry event relay', function (test) {
    Swarm.env.localhost = host;
    var flag = new Palette();
    var red = new Color({
        rgb: 'f00'
    });
    var black = new Color({
        rgb: '000000'
    });
    flag.push(red);
    var gw = new Gateway(host);
    expect(7);
    gw.ON('Palette', flag._id, function (ev) {
        if (ev.name==='load') {
            console.log("God save the... What?");
            ev.value.forEach(function(pojo){delete pojo._id;});
            deepEqual(ev.value, [{rgb: 'f00', name:''}]);
        } else if (ev.name==='entry:set') {
            console.log("Great Socialist Revolution!");
            equal(ev.name, 'entry:set');
            equal(ev.entry_id, red._id);
            deepEqual(ev.value, {name: 'red'});
        } else if (ev.name==='insert') {
            if (ev.value.name==='white') {
                console.log("Pilsudsky, you're a bitch!");
                equal(1,1);
            } else {
                equal(ev.value.rgb, '000000');
                console.log("Welcome, Adolf!");
            }
        } else if (ev.name==='remove') {
            console.log("Your turn, Joseph.");
            //flag.remove(white);
            equal(ev.entry_id, black._id);
        }
    });
    red.set({name:'red'});
    var white = new Color(white_pojo);
    flag.push(white);
    flag.unshift(black);
    flag.shift();
    // black.set({name: 'black'}); // no reaction
    Swarm.env.localhost = null;
});

test('2.d insert+submit', function (test) {
    Swarm.env.localhost = host;
    var gw = new Gateway(host);

    var jamaica = new Palette();
    jamaica.insert(black_pojo);
    var jamaica_green_pojo = {
        rgb: '009b3a',
        name: 'jamaica green'
    };
    var jamaica_green = new Color(jamaica_green_pojo);
    gw.ON('Palette', jamaica._id, function () {
        // ...
    });
    var spec = gw.SUBMIT(
        'Color',
    {
        rgb: 'fed100',
    }, function (ev) {
        if (ev.name==='init') {return;}
        equal(ev.value.name, 'gold');
    });

    var gold_obj = host.get(new Spec(spec).filter('/#'));
    gold_obj.set({name: 'gold'});

    var gold_id = new Spec(spec).id();
    gw.INSERT(jamaica._id, jamaica_green._id);
    gw.INSERT(jamaica._id, gold_id);
    var pojos = jamaica.toPojoCollection();
    pojos.forEach(function(pojo){delete pojo._id;});
    deepEqual(pojos, [
        {
            rgb: 'fed100',
            name: 'gold'
        },
        jamaica_green_pojo,
        black_pojo
    ]);
    Swarm.env.localhost = null;
});

asyncTest('2.e async storage', function (test) {
    var storage = new Swarm.Storage(true);
    var host = Swarm.env.localhost = new Swarm.Host('gritzko',0,storage);
    var gw = new Gateway(host);

    expect(1);
    gw.ON('Palette', "mepty", function (ev) {
        equal(ev.name,'load');
        start();
    });

    Swarm.env.localhost = null;
});
