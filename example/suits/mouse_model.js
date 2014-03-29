(function(root, factory) {

    // Set up Swarm appropriately for the environment.

    // Start with AMD.
    if (typeof define === 'function' && define.amd) {

        define(['Swarm', 'exports'], function(Swarm, exports) {
            // Export global even in AMD case in case this script is loaded with others that may still expect a global Backbone.
            root.MouseModels = factory(root, Swarm, exports);
        });

        // Next for Node.js or CommonJS.
    } else if (typeof exports !== 'undefined') {

        var Swarm = require('../../lib/swarm3.js');
        factory(root, Swarm, exports);

        // Finally, as a browser global.
    } else {

        root.MouseModels = factory(root, root.Swarm, {});
    }

} (this, function(root, Swarm, MouseModels) {

// Our key class: a mouse pointer :)
    MouseModels.Mouse = Swarm.Model.extend('Mouse', {
        defaults: {
            x: 0,
            y: 0,
            ms: 0// last activity timestamp
        }
    });

    // this collection class has no functionality except for being a list
    // of all mice currently alive; we'll only use one singleton object
    // set mixin
    MouseModels.Mice = Swarm.Set.extend('Mice', {

    });

    // server state tracking: TODO

    MouseModels.PeerData = Swarm.Model.extend('PeerData', {
        defaults: {
            timeToRestart: 0,
            objectsTracked: 0
        }
    });

    return MouseModels;
}));
