"use strict";

var param = require('minimist')(process.argv.slice(2), {
    boolean: ['debug'],
    default: {
        storageKind: 'redis', // 'file', 'in-memory', 'level'
        clientsCount: 10,
        operationsCount: 100,
        frequency: 20,
        miceId: 'mice~x',
        serverHostId: 'swarm~st',
        debug: false,
        swarmDebug: false
    }
});

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);
process.on('uncaughtException', function (err) {
    console.error('Uncaught Exception: ', err, err.stack);
    onExit(2);
});

var async = require('async');
var Swarm = require('../lib/NodeServer');
Swarm.env.debug = param.swarmDebug;
Swarm.env.multihost = true;
var AsyncLoopbackConnection = require('../lib/AsyncLoopbackConnection');

var Mice = require('./model/Mice');
var Mouse = require('./model/Mouse');

async.auto({

    create_storage: createAndOpenStorage,

    create_server: ['create_storage', async.apply(createServerHost, 'create_storage')],

    create_clients: function createClients(cb, results) {
        if (param.debug) { console.log('createClients() enter'); }

        var clientHosts = [];
        for (var i = 0; i < param.clientsCount; i++) {
            var client = new Swarm.Host('client~' + i);
            client._index = i;
            clientHosts.push(client);
        }

        if (param.debug) { console.log('createClients() leave'); }
        cb(null, clientHosts);

    },

    interconnect: ['create_server', 'create_clients', function connectClientsToServer(cb, results) {
        if (param.debug) { console.log('connectClientsToServer() enter'); }

        var server = results.create_server;
        var clients = results.create_clients;

        // setup async-loopback connection: use random delay
        AsyncLoopbackConnection.delay = function delay_for_random_time() {
            return 0 | (param.frequency * 3 * Math.random());
        };

        // connect all clients to the server
        clients.forEach(function (client, idx) {
            var loopback_id = 's' + idx;
            server.accept('loopback:' + loopback_id);
            client.connect('loopback:' + loopback_id.match(/./g).reverse().join(''));
        });

        if (param.debug) { console.log('connectClientsToServer() leave'); }
        cb();
    }],

    start_clients: ['interconnect', function startClients(cb, results) {
        if (param.debug) { console.log('startClients() enter'); }

        console.log('START WRITING');

        var clients = results.create_clients;

        var tasks = clients.map(function getTaskForClient(client) {
            return async.apply(singleClientTask, client);
        });
        async.parallel(tasks, function (err, miceSets) {
            if (param.debug) { console.log('startClients() leave'); }
            cb(err, miceSets);
        });
    }],

    wait_for_sync_done: ['start_clients', function waitSyncDone(cb, results) {
        if (param.debug) { console.log('waitSyncDone() enter'); }
        setTimeout(function onTimer() {
            if (param.debug) { console.log('waitSyncDone() leave'); }
            console.log('FINISHED WRITING');
            cb();
        }, param.frequency * 6);
    }],

    save_mice: ['wait_for_sync_done', async.apply(openServerMice, 'create_server')],

    close_all: ['save_mice', function closeAll(cb, results) {
        if (param.debug) {  console.log('closeAll() enter'); }

        var clients = results.create_clients;

        var tasks = clients.map(function getCloseTask(client) {
            return client.close.bind(client);
        });

        async.parallel(tasks, function onClientsClosed(err) {
            if (err) {
                return cb(err);
            }
            if (param.debug) { console.log('closeAll() clients closed'); }

            var server = results.create_server;
            server.close(function onServerClosed(err) {
                if (param.debug) { console.log('closeAll() leave'); }
                console.log('START READING');
                cb(err);
            });
        });

    }],

    recreate_storage: ['close_all', createAndOpenStorage],

    recreate_server: ['recreate_storage', async.apply(createServerHost, 'recreate_storage')],

    save_mice_2: ['recreate_server', async.apply(openServerMice, 'recreate_server')],

    compare_written_with_read: ['save_mice_2', function compare(cb, results) {
        if (param.debug) { console.log('compare() enter'); }
        console.log('FINISHED READING');
        console.log('START COMPARISON');
        var original_client_mice_sets = results.start_clients;
        var mice_written = results.save_mice;
        var mice_read = results.save_mice_2;

        var not_same = mice_written !== mice_read;
        var length_ok = mice_written.length() === mice_read.length();
        var items_ok = length_ok && compareEntries(mice_written, mice_read);
        var coordinates_ok = items_ok && compareCoordinates(mice_written, mice_read);
        var clients_ok = [0, 0, 0, 0];

        original_client_mice_sets.forEach(function compareClientMice(client_mice) {
            var not_same = mice_written !== client_mice;
            var len_ok = mice_written.length() === client_mice.length();
            var entries_ok = len_ok && compareEntries(mice_written, client_mice);
            var coordinates_ok = entries_ok && compareCoordinates(mice_written, client_mice);
            clients_ok[0] += not_same ? 1 : 0;
            clients_ok[1] += len_ok ? 1 : 0;
            clients_ok[2] += entries_ok ? 1 : 0;
            clients_ok[3] += coordinates_ok ? 1 : 0;
        });

        if (param.debug) { console.log('compare() leave'); }
        console.log('FINISHED COMPARISON');
        cb(null, {
            not_same: not_same,
            length_ok: length_ok,
            items_ok: items_ok,
            coordinates_ok: coordinates_ok,
            clients_ok: clients_ok
        });

        function getSpecStr(entry) {
            return entry.spec().toString();
        }

        function compareEntries(originalSet, actualSet) {
            var set1_object_ids = originalSet.map(getSpecStr).sort().join('');
            var set2_object_ids = actualSet.map(getSpecStr).sort().join('');
            return set1_object_ids === set2_object_ids;
        }

        function compareCoordinates(originalSet, actualSet) {
            return originalSet.every(function (originalMouse) {
                var actualMouse = actualSet.get(originalMouse.spec());
                return originalMouse !== actualMouse &&
                        originalMouse.x === actualMouse.x &&
                        originalMouse.y === actualMouse.y &&
                        originalMouse.symbol === actualMouse.symbol;
            });
        }
    }],

    close_server: ['compare_written_with_read', function closeServer(cb, results) {
        if (param.debug) { console.log('closeServer() enter'); }
        var server = results.create_server;
        server.close(function onServerClosed() {
            if (param.debug) { console.log('closeServer() leave'); }
            cb();
        });
    }]

}, function (err, results) {
    console.log("========\nerr: ", err);

    var compare_res = results.compare_written_with_read;
    console.log('results: %j', compare_res);
    process.exit(err ? 1 : 0);
});

function singleClientTask(client, cb) {
    if (param.debug) { console.log('client~%s start', client._index); }
    var mice = new Mice(param.miceId, undefined, client);
    var mouse = new Mouse('M~' + client._index, undefined, client);
    mice.once('init', function onMiceInited() {
        mouse.once('init', function onMouseInited() {
            mouse.set({
                symbol: 'M~' + client._index,
                x: 150,
                y: 150
            });
            mice.addObject(mouse);

            var counter = 0;
            var moveMouseTask = setInterval(function moveMouse() {
                if ((counter++) > param.operationsCount) {
                    clearInterval(moveMouseTask);
                    if (param.debug) { console.log('client~%s done', client._index); }
                    cb(null, mice);
                }
                if (param.debug) {
                    console.log('client~%s %d iteration', client._index, counter);
                } else if (counter % 100 === 0) {
                    console.log('client~%s %d iteration', client._index, counter);
                }
                // move randomly +/- 3px over x and y
                mouse.set({
                    x: Math.min(300, Math.max(0, mouse.x + (0 | (Math.random() * 6 - 3)))),
                    y: Math.min(300, Math.max(0, mouse.y + (0 | (Math.random() * 6 - 3))))
                });
            }, (param.frequency - (0 | (param.frequency * Math.random() / 4))));
        });
    });
}

var mem_storage;
function createAndOpenStorage(cb) {
    if (param.debug) { console.log('createAndOpenStorage() enter'); }

    var storage;

    switch (param.storageKind) {
    case 'in-memory':
        if (!mem_storage) {
            mem_storage = new Swarm.Storage(true);
        }
        storage = mem_storage
        onStorageOpened();
        break;

    case 'redis':
        storage = new Swarm.RedisStorage('dummy', {
            redis: require('redis'),
            redisConnectParams: {}
        });
        storage.open(onStorageOpened);
        break;

    case 'file':
        storage = new Swarm.FileStorage('.testStorage.file');
        onStorageOpened();
        break;

    case 'level':
        storage = new Swarm.LevelStorage('lvl', {
            path: '.testStorage.lvl',
            db: require('leveldown')
        });
        storage.open(onStorageOpened);
        break;

    default:
        onStorageOpened(new Error('Unknown storage "%s" (supported values are "in-memory", "redis", "file", "level")'));
    }

    function onStorageOpened(err) {
        if (err) {
            return cb(err);
        }
        if (param.debug) { console.log('createAndOpenStorage() leave'); }
        cb(null, storage);
    }
}

function createServerHost(storageResult, cb, results) {
    if (param.debug) { console.log('createServerHost() enter'); }

    var storage = results[storageResult];

    var server = new Swarm.Host('swarm~bm', 0, storage);
    Swarm.env.localhost = server;

    if (param.debug) { console.log('createServerHost() leave'); }
    cb(null, server);
}

function openServerMice(serverResult, cb, results) {
    if (param.debug) { console.log('openServerMice(%s) enter', serverResult); }
    var server = results[serverResult];
    var mice = server.get('/Mice#' + param.miceId);
    mice.onObjectStateReady(function () {
        if (param.debug) { console.log('openServerMice(%s) leave', serverResult); }
        cb(null, mice);
    });
}

function onExit(exitCode) {
    process.exit(exitCode);
}
