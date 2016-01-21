"use strict";
require('stream-url-node');
var fs = require('fs');
var rimraf = require('rimraf');
var Swarm = require('swarm-server');
var Client = require('swarm-client').Client;
var Server = Swarm.Server;
var level = require('level');
var memdown = require('memdown');
var util = require('../util');

var tape = require('tap').test;
var skip = function () {};

Swarm.Host.multihost = true;
// Swarm.Host.debug = true;
// Swarm.Replica.trace = true;
// Swarm.Replica.debug = true;
// Swarm.StreamOpSource.debug = true;

/* Create a client with an empty database, create one object,
 * re-create a client, verify the data is accessible.
 */
tape ('1.A Reopening database', function (t) {
    var db_path = '.test_db.1A_' + (new Date().getTime());
    var client, testModel;

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');
        testModel = new Swarm.Model({initial: 'some state'}, client.host);

        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel._version);

        setTimeout(function () {
            close_client(function () {
                client = util.start_client(null, db_path, fetch_model);
            });
        }, 300);
    }

    function close_client(callback) {
        t.pass('Closing the client...');
        client.close(callback);
    }

    function fetch_model() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel, 'Expect the test object to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized ' + sameModel.typeid() + ' ' + sameModel.version());

        });
        sameModel.on('change', function () {
            t.pass('Object updated ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.initial);
            setTimeout(end_test, 100);
        });
    }

    function end_test() {
        close_client(function () {
            fs.existsSync(db_path) && rimraf.sync(db_path);
            t.end();
        });
    }

    client = util.start_client(null, db_path, create_model);
});

/*
 * Start two unrelated clients, not connected to any upstream server.
 * Just testing the 'multihost' feature
 */
tape ('1.B Multiple clients', function (t) {
    t.plan(6);
    var client1 = new Client({
        ssn_id: 'alice~0',
        db_id: 'testdb1',
        db: level(memdown),
        callback: function () {
            t.pass('First client is ready');
        },
    });
    var client2 = new Client({
        ssn_id: 'bob~1',
        db_id: 'testdb2',
        db: level(memdown),
        callback: function () {
            t.pass('Second client is ready');
        },
    });

    setTimeout(function () {
        t.pass('Closing first client');
        client1.close(function () {
            t.pass('First client closed');

            setTimeout(function () {
                t.pass('Closing second client');
                client2.close(function () {
                    t.pass('Second client is closed');
                    t.end();
                });
            }, 500);
        });
    }, 500);
});

/*
 * Start the server/client pair.
 * Close the client first, then the server.
 */
tape ('1.C Client and Server', function (t) {
    t.plan(6);

    var db_path = '.test_db.1C_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var listen_url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;
    fs.existsSync(db_path) && rimraf.sync(db_path);

    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: db_path,
        listen: listen_url,
        callback: function () {
            t.pass('Server is ready');
        },
    });
    var client = new Client({
        ssn_id: 'alice~1',
        db_id: 'testdb',
        db: level(memdown),
        connect: listen_url,
        callback: function () {
            t.pass('Client is ready');
        },
    });

    setTimeout(function () {
        t.pass('Close client');
        client.close(function () {
            t.pass('Client closed');
        });
    }, 2000);

    setTimeout(function () {
        t.pass('Close server');
        server.close(function () {
            t.pass('Server closed');
            fs.existsSync(db_path) && rimraf.sync(db_path);
            t.end();
        });
    }, 3000);
});

/*
 * Start the server/client pair.
 * First, shut down the server, then stop the client.
 */
tape ('1.D Client and Server', function (t) {
    t.plan(6);

    var db_path = '.test_db.1D_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var listen_url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;
    fs.existsSync(db_path) && rimraf.sync(db_path);

    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: db_path,
        listen: listen_url,
        callback: function () {
            t.pass('Server is ready');
        },
    });
    var client = new Client({
        ssn_id: 'carol~1',
        db_id: 'testdb',
        db: level(memdown),
        connect: listen_url,
        callback: function () {
            t.pass('Client is ready');
        },
    });

    setTimeout(function () {
        t.pass('Close server');
        server.close(function () {
            t.pass('Server closed');
        });
    }, 2000);
    setTimeout(function () {
        t.pass('Close client');
        client.close(function () {
            t.pass('Client closed');
            fs.existsSync(db_path) && rimraf.sync(db_path);
            t.end();
        });
    }, 3000);
});

/* Start the client/server pair,
 * create an object from the client, submit it to the server,
 * restart the client with an empty database and fetch the same
 * object back.
 */
tape ('1.E Client restarts from the scratch', function (t) {
    t.plan(13);

    var server_db_path = '.test_db.1E_server_' + (new Date().getTime());

    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var listen_url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;
    fs.existsSync(server_db_path) && rimraf.sync(server_db_path);

    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: server_db_path,
        listen: listen_url,
        callback: function () {
            t.pass('Server is ready');
        },
    });

    var client, testModel;

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');

        testModel = client.get('/Model');
        testModel.set({key: 'first'});

        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel.version());

        setTimeout(function () {
            close_client(function () {
                client = util.start_client(listen_url, null, null, fetch_model);
            });
        }, 1000);
    }

    function close_client(callback) {
        t.pass('Closing the client...');
        client.close(function () {
            t.pass('Client closed');
            callback();
         });
    }

    function fetch_model() {
        t.ok(testModel, 'Expect testModel to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized ' + sameModel.typeid() + ' ' + sameModel.version());
        });

        sameModel.on('change', function () {
            t.equal(sameModel.version(), testModel.version(), 'Version should match');
            t.equal(sameModel.key, 'first', 'Property value should match');
            end_test();
        });
    }

    function end_test() {
        close_client(function () {
            t.pass('Closing server...');
            server.close(function () {
                t.pass('Server closed');
                fs.existsSync(server_db_path) && rimraf.sync(server_db_path);
                t.end();
            });
        });
    }

    client = util.start_client(listen_url, null, null, create_model);
});

/* Start the client/server pair, create an object from the client,
 * restart the client with the same database and fetch the same object back.
 */
tape ('1.F Client restarts without a server', function (t) {
    t.plan(15);

    var client_db_path = '.test_db.1F_client_' + (new Date().getTime());
    var server_db_path = '.test_db.1F_server_' + (new Date().getTime());

    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var listen_url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;
    fs.existsSync(client_db_path) && rimraf.sync(client_db_path);
    fs.existsSync(server_db_path) && rimraf.sync(server_db_path);

    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: server_db_path,
        listen: listen_url,
        callback: function () {
            t.pass('Server is ready');
        },
    });

    var client, testModel;

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');

        testModel = client.get('/Model');
        testModel.set({key: 'second'});
        t.pass('New model created: ' + testModel.typeid());

        setTimeout(restart, 500);
    }

    function restart() {
        t.pass('Closing server...');
        server.close(function () {
            t.pass('Server closed');
            close_client(function () {
                client = util.start_client(listen_url, client_db_path, function () {
                    t.pass('Client re-connected');
                    fetch_model();
                });
            });
        });
    }

    function close_client(callback) {
        t.pass('Closing the client...');
        client.close(function () {
            t.pass('Client closed');
            callback();
         });
    }


    function fetch_model() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel, 'Expect testModel to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized');
        });
        sameModel.on('change', function () {
            t.equal(sameModel.version(), testModel.version(), 'Version should be the same');
            t.equal(sameModel.key, 'second');
            close_client(function () {
                fs.existsSync(server_db_path) && rimraf.sync(server_db_path);
                fs.existsSync(client_db_path) && rimraf.sync(client_db_path);
                t.end();
            });
        });
    }

    client = util.start_client(listen_url, client_db_path, null, create_model);
});

/*
 * Start the server and connect two clients,
 * create an object from one client and fetch it from another
 */
tape ('1.G Server and two clients', function (t) {
    t.plan(15);

    /* One client will use fs-backed DB and another - in-memory */
    var client_db_path = '.test_db.1G_client_' + (new Date().getTime());
    var server_db_path = '.test_db.1G_server_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var listen_url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;

    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: server_db_path,
        listen: listen_url,
        callback: function () {
            t.pass('Server is ready');
        },
    });

    var client1, client2, testModel;

    function start_first_client() {
        client1 = new Client({
            ssn_id: 'alice~1',
            db_id: 'testdb',
            db: level(client_db_path),
            connect: listen_url,
            callback: function () {
                t.pass('First client is ready');
            },
        });
        util.on_upstream_connection(client1, create_model);
    }

    function create_model() {
        t.ok(client1, 'Expect first client to be instantiated');

        testModel = client1.get('/Model');
        t.pass('Created new model ' + testModel.typeid());
        testModel.set({key: 'third'});

        setTimeout(function () {
            t.pass('Close first client');
            client1.close(function () {
                t.pass('First client closed');
                start_second_client();
             });
        }, 1000);
    }

    function start_second_client() {
        client2 = new Client({
            ssn_id: 'bob~2',
            db_id: 'testdb',
            db: level(memdown),
            connect: listen_url,
            callback: function () {
                t.pass('Second client is ready');
            },
        });
        util.on_upstream_connection(client2, fetch_model);
    }


    function fetch_model() {
        t.ok(client2, 'Expect second client to be instantiated');
        t.ok(testModel, 'Expect test object to be instantiated');

        var sameModel = client2.get(testModel.typeid());
        sameModel.onInit(function () {
            t.equal(sameModel.version(), testModel.version());
            t.equal(sameModel.key, 'third');
            end_test();
        });
    }

    start_first_client();

    function end_test() {
        t.pass('Close server');
        server.close(function () {
            t.pass('Server closed');
            t.pass('Close second client');
            client2.close(function () {
                t.pass('Second client closed');
                fs.existsSync(client_db_path) && rimraf.sync(client_db_path);
                fs.existsSync(server_db_path) && rimraf.sync(server_db_path);
                t.end();
            });
        });
    }
});

tape ('1.H Client creates an unknown object', function (t) {
    var client = new Client({
        ssn_id: 'alice~1',
        db_id: 'testdb',
        db: level(memdown),
        callback: function () {
            t.pass('Client is ready');

            var model = client.get('/Model#12345+swarm~0');
            t.pass('Model created ' + model.typeid() + ' ' + model.version());

            model.onInit(function () {
                t.fail('Object should not be initialized without a server connection ' + model.typeid() + ' ' + model.version());
            });
            model.on('change', function () {
                t.pass('Change event received ' + model.typeid() + ' ' + model.version());
            });
        },
    });

    setTimeout(function () {
        t.pass('Closing the client...');
        client.close(function () {
            t.pass('Client closed');
            t.end();
        });
    }, 3000);
});

tape ('1.HH Server creates an unknown object', function (t) {
    var db_path = '.test_db.1HH_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    Swarm.Host.multihost = true;
    fs.existsSync(db_path) && rimraf.sync(db_path);

    var serverHost;
    var server = util.start_server(url, db_path, function () {
        // Additional server host should be added once the server is ready
        serverHost = util.create_server_host(server);
    });
    var client = util.start_client(url, null, null, create_model);

    function create_model () {
        var locallyCreated = new Swarm.Model({key: 'value'}, client.host);
        t.ok(locallyCreated.version(), 'Locally created object should be stateful');
        verify(locallyCreated.typeid());
    }

    function verify(typeid) {
        var remotelyCreated = serverHost.get(typeid);
        t.ok(remotelyCreated, 'Host.get should return a non-null object');
        remotelyCreated.on('init', function (ev) {
            t.pass('Remotely created object is initialized');
        });
        remotelyCreated.on('change', function (ev) {
            t.pass('Remotely created object is updated');
            t.equal(remotelyCreated.key, 'value', 'Property value should be updated');
        });

        setTimeout(end, 500);
    }

    function end() {
        server.close(function () {
            client.close(function () {
                fs.existsSync(db_path) && rimraf.sync(db_path);
                t.end();
            });
        });
    }
});

tape ('1.I Object updates', function (t) {
    var db_path = '.test_db.1I_' + (new Date().getTime());
    fs.existsSync(db_path) && rimraf.sync(db_path);

    t.plan(14);

    var client = new Client({
        ssn_id: 'carol~0',
        db_id: 'testdb1',
        db: level(db_path),
        callback: function () {
            t.pass('Client is ready');
            create_models();
        },
    });

    function create_models() {
        t.ok(client, 'Expect the client to be instantiated');

        var models = [];

        models.push(new Swarm.Model({a: 'initial value of a', b: 'initial value of b'}, client.host));
        models.push(new Swarm.Model({a: 'initial value of a', b: 'initial value of b'}, client.host));
        models.push(new Swarm.Model({a: 'initial value of a', b: 'initial value of b'}, client.host));

        models.forEach(function (m) {
            m.on('change', function () {
                t.pass(m.typeid() + ' changed to ' + m.version() + ' a: ' + m.a + ' b: ' + m.b);
            });
        });

        function updateWith(m, func) {
            func(function () {
                t.pass(m.typeid() + ' first update ...');
                m.set({a: 'updated'});
                func(function () {
                    t.pass(m.typeid() + ' second update ...');
                    m.set({a: 'updated again', b: 'also updated'});
                });
            });
        }

        updateWith(models[0], process.nextTick);
        updateWith(models[1], function (cb) { setTimeout(cb, 0); });
        updateWith(models[2], function (cb) { setTimeout(cb, 100); });
        setTimeout(end_test, 1000);
    }

    function end_test() {
        client.close(function () {
            fs.existsSync(db_path) && rimraf.sync(db_path);
            t.end();
        });
    }

});
