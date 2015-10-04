"use strict";
var Swarm = require("../../"); // FIXME multipackage

var Color = Swarm.Model.extend ("Color", {
    defaults: {
        rgb: '',
        name: ''
    }
});

var Palette = Swarm.Collection.Vector.extend("Palette", {
    entryType: Color._pt._type
});

module.exports = {
    Color: Color,
    Palette: Palette
};
