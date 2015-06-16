"use strict";

var fs = require('fs');

var levelup = require('level');

var env = require('../lib/env.js');
var Host = require('../lib/Host.js');
var Storage = require('../lib/Storage.js');
require('./TestServer.js');

var dbpath = './_testdb';
if (fs.existsSync()) {
    fs.rmdirSync(dbpath);
}
var db = levelup(dbpath);

var storage = new Storage(db);
var host = new Host('loc~al', storage);

host.listen('test:std');
