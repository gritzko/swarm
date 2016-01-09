"use strict";
require('stream-url-node');
var fs = require('fs');
var rimraf = require('rimraf');
var Swarm = require('swarm-server');
var SwarmClient = require('swarm-client');
var Server = Swarm.Server;
var Client = SwarmClient.Client;
var bat = require('swarm-bat');
var level = require('level');
var memdown = require('memdown');

var tape = require('tap').test;

Swarm.Host.multihost = true;
// Swarm.Host.debug = true;
// Swarm.Replica.trace = true;
// Swarm.Replica.debug = true;
Swarm.StreamOpSource.debug = true;

function on_connection(client, callback) {
    client.replica.on('connection', function (op_stream) {
        op_stream.upstream && callback();
    });
}

/* Create a client with an empty database, create one object,
 * re-create a client, verify the data is accessible.
 */
tape ('1.A Reopening database', function (t) {
    var db_path = '.test_db.1A_' + (new Date().getTime());
    var client, testModel;

    function start_client(callback) {
        client = new Client({
            ssn_id: 'swarm~0',
            db_id: 'testdb1',
            db: level(db_path),
            callback: function () {
                t.pass('Client is ready');
                callback();
            },
        });
    }

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');

        testModel = new Swarm.Model({initial: 'some state'}, client.host);

        //testModel = client.get('/Model');
        //testModel.set({"initial": 'some state'});

        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel._version);

        setTimeout(function () {
            // testModel.set({"initial": 'some state'});
        }, 100);

        setTimeout(function () {
            close_client(function () {
                start_client(fetch_model);
            });
        }, 500);
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
            //t.equal(sameModel.version(), testModel.version(), 'Versions should be equal');
            //t.equal(sameModel.initial, testModel.initial, 'Property value should be the same');
            setTimeout(end_test, 1000);

        });
        sameModel.on('change', function () {
            t.pass('Object updated ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.initial);
        });
    }

    function end_test() {
        close_client(function () {
            t.end();
        });
    }

    start_client(create_model);
});

/*
 * Start two unrelated clients, not connected to any upstream server.
 * Just testing the 'multihost' feature
 */
tape ('1.B Multiple clients', function (t) {
    t.plan(6);
    var client1 = new Client({
        ssn_id: 'swarm~0',
        db_id: 'testdb1',
        db: level(memdown),
        callback: function () {
            t.pass('First client is ready');
        },
    });
    var client2 = new Client({
        ssn_id: 'swarm~1',
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
        ssn_id: 'swarm~1',
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
        ssn_id: 'swarm~1',
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
    t.plan(17);

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

    function start_client(callback) {
        t.pass('Creating a client...');
        client = new Client({
            ssn_id: 'swarm~1',
            db_id: 'testdb',
            db: level(memdown),
            connect: listen_url,
            callback: function () {
                t.pass('Client is ready');
            },
        });
        on_connection(client, callback);
    }

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');

        testModel = client.get('/Model');
        testModel.set({key: 'first'});

        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel.version());

        setTimeout(function () {
            close_client(function () {
                start_client(fetch_model);
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

    function restart_client() {
        t.pass('Re-creating a client...');
    }

    function fetch_model() {
        t.ok(testModel, 'Expect testModel to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized ' + sameModel.typeid() + ' ' + sameModel.version());
        });

        sameModel.on('change', function () {
            t.equal(sameModel.version(), testModel.version());
            t.equal(sameModel.key, 'first');
            end_test();
        });
    }

    function end_test() {
        close_client(function () {
            t.pass('Closing server...');
            server.close(function () {
                t.pass('Server closed');
                t.end();
            });
        });
    }

    start_client(create_model);
});

/* Start the client/server pair, create an object from the client,
 * restart the client with the same database and fetch the same object back.
 */
tape ('1.F Client restarts without a server', function (t) {
    t.plan(19);

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

    function start_client(callback, connection_callback) {
        t.pass('Creating a client...');
        client = new Client({
            ssn_id: 'swarm~1',
            db_id: 'testdb',
            db: level(client_db_path),
            connect: listen_url,
            callback: function () {
                t.pass('Client is ready');
                callback && callback();
            },
        });

        if (connection_callback)
            on_connection(client, connection_callback);
    }

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
                start_client(function () {
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
                t.end();
            });
        });
    }

    start_client(null, create_model);
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

    var client1, client2, testModel;

    function start_first_client() {
        client1 = new Client({
            ssn_id: 'swarm~1',
            db_id: 'testdb',
            db: level(client_db_path),
            connect: listen_url,
            callback: function () {
                t.pass('First client is ready');
            },
        });
        on_connection(client1, create_model);
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
            ssn_id: 'swarm~2',
            db_id: 'testdb',
            db: level(memdown),
            connect: listen_url,
            callback: function () {
                t.pass('Second client is ready');
            },
        });
        on_connection(client2, fetch_model);
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
                t.end();
            });
        });
    }
});
