"use strict";
var sync = require('..');
var Spec = sync.Spec;
var Op = sync.Op;
var tape = require('tap').test;


tape ('protocol.03.A basic specifier syntax', function (tap) {

    var spec_str = '/Class#ID!7Umum+gritzkoSsn.event';
    var spec = new Spec(spec_str);
    // getters
    tap.equal(spec.stamp, '7Umum+gritzkoSsn');
    tap.equal(spec.id, 'ID');
    tap.equal(spec.type, 'Class');
    tap.equal(spec.name, 'event');
    tap.equal(spec.origin,'gritzkoSsn');
    tap.equal(spec.Stamp.origin, 'gritzkoSsn');
    tap.equal(spec.Id.value, 'ID');
    tap.equal(spec.Type.value, 'Class');
    tap.equal(spec.Name.origin, '0');
    tap.ok(spec.Name.isTranscendent());
    // toString
    tap.equal(spec.toString(), spec_str);
    // copy constructor
    var spec2 = new Spec(spec);
    tap.equal(spec.toString(), spec2.toString());
    // fill/blank/skip
    var typeid = spec.blank("/#");
    tap.equal(typeid.toString(), "/Class#ID!0.0");
    tap.equal(spec.toString(typeid), "!7Umum+gritzkoSsn.event");
    var spec3 = typeid.fill(spec.blank('!.'));
    tap.equals(spec3.toString(), spec_str);
    // immutable object reuse
    tap.ok(spec.Id===spec3.Id);
    // incomplete spec
    var incomplete = new Spec(".on");
    tap.equal(incomplete.id, '0');
    tap.equal(incomplete.stamp, '0');
    tap.ok(incomplete.Type.isZero());

    // another spec to pase
    var fieldSet = new Spec('/TodoItem+~x#7AM0f+gritzko!7AMTc+gritzko.set');
    tap.equal(fieldSet.type,'TodoItem+~x', 'type');
    tap.equal(fieldSet.id,'7AM0f+gritzko', 'id');
    tap.equal(fieldSet.stamp,'7AMTc+gritzko', 'stamp');
    tap.equal(fieldSet.name,'set');

    tap.equal(fieldSet.typeid, '/TodoItem+~x#7AM0f+gritzko');
    tap.equal(fieldSet.stampop, '!7AMTc+gritzko.set');

    tap.end();

});


tape ('protocol.03.B corner cases', function (tap) {

    var empty = new Spec('');
    tap.ok(empty.type===empty.id && empty.name===empty.stamp);
    tap.equal(empty.toString(Spec.ZERO), '.0');

    var action = new Spec('.on+re');
    tap.equal(action.name,'on+re');

    tap.end();

});


tape ('protocol.03.f op regexes', function (t) {
    var reSpec = new RegExp(Spec.rsSpec);
    t.ok(reSpec.test('/Swarm#db!stamp+user~ssn.on'), '.on spec');
    t.end();
});

