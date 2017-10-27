const cli = require('commander');

cli
    .version('2.0.0')
    .option('-a, --alone', 'do not connect')
    .option('-d, --deaf',  'do not listen')
    .option('-r, --read',  'inspect files for any changes')
    .option('-w, --write', 'ensure all files are up-to-date')
    .option('-s, --sync',  '--read and --write')
    .option('-p, --print <spec>',  'print out db records')
    .option('-d, --dump <spec>',  'dump records as an SST file')
    .parse(process.argv);

// "peer" is generic, serialization and routing

// set things up
//      init the "bus"
//      attach to the bus
//          init store
//          init types
//          check mounts
//      connect
//          init subs
//      listen
//          init pubs