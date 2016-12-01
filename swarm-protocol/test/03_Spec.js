"use strict";
const sync = require('..');
const Spec = sync.Spec;
const Op = sync.Op;
const tape = require('tape').test;


tape ('protocol.03.A basic specifier syntax', function (tap) {

    var spec_str = '#ID.json@7Umum-gritzkoSsn:event';
    var spec = Spec.fromString(spec_str);
    // getters
    tap.equal(spec.stamp, '7Umum-gritzkoSsn');
    tap.equal(spec.id, 'ID');
    tap.equal(spec.type, 'json');
    tap.equal(spec.eventName, 'event');
    tap.equal(spec.origin,'gritzkoSsn');
    tap.equal(spec.Stamp.origin, 'gritzkoSsn');
    tap.equal(spec.Id.value, 'ID');
    tap.equal(spec.Type.value, 'json');
    tap.equal(spec.Location.origin, '0');
    tap.ok(spec.Location.isTranscendent());
    // toString
    tap.equal(spec.toString(), spec_str);
    // copy constructor
    var spec2 = new Spec(spec.Id, spec.Type, spec.stamp, spec.loc);
    tap.equal(spec.toString(), spec2.toString());
    // fill/blank/skip
    var typeid = spec.typeid;
    tap.equal(typeid.toString(), "#ID.json");
    tap.equal(spec.toString(spec.Object), "@7Umum-gritzkoSsn:event");
    tap.equal(spec.event, "@7Umum-gritzkoSsn:event");
    //var spec3 = typeid.fill(spec.blank('!.'));
    //tap.equals(spec3.toString(), spec_str);
    // immutable object reuse
    //tap.ok(spec.Id===spec3.Id);
    // incomplete spec
    var incomplete = Spec.fromString(":~on");
    tap.equal(incomplete.id, '0');
    tap.equal(incomplete.stamp, '0');
    tap.ok(incomplete.Type.isZero());

    // another spec to pase
    var fieldSet = Spec.fromString('#7AM0f-gritzko.item-~p@7AMTc-gritzko:set');
    tap.equal(fieldSet.type,'item-~p', 'type');
    tap.equal(fieldSet.id,'7AM0f-gritzko', 'id');
    tap.equal(fieldSet.stamp,'7AMTc-gritzko', 'stamp');
    tap.equal(fieldSet.eventName,'set');

    tap.equal(fieldSet.typeid, '#7AM0f-gritzko.item-~p');
    tap.equal(fieldSet.event, '@7AMTc-gritzko:set');

    tap.end();

});


tape ('protocol.03.B corner cases', function (tap) {

    var empty = new Spec('');
    tap.ok(empty.type===empty.id && empty.name===empty.stamp);
    tap.equal(empty.toString(), ':0');

    var action = Spec.fromString(':~on-re');
    tap.equal(action.eventName,'~on');

    tap.end();

});


tape ('protocol.03.f op regexes', function (t) {
    var reSpec = new RegExp(Spec.rsSpec);
    t.ok(reSpec.test('#db.db@stamp+user~ssn:~on'), '.on spec');
    t.end();
});

