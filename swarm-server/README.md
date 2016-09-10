# Swarm: a basic server

A simple LevelDB-backed WebSocket and TCP-listening Swarm server (peer).

## Usage

    swarm [-C|-F|-A|-R] [options] path/database-id

C, F, A, R are run modes (create, fork, access, run).
The database directory name consists of the database id and peer id.

```bash

npm install -g swarm-server
    
# creates an empty "test" database replica (peer id 1) at ./test-1
swarm -C --oClock=Logical ./test-1

# WebSocket-only Swarm server, runs REPL, which is good for debugging
swarm -R ./test-1 --listen ws://localhost:8080
```

## Options

- [x] `-C --create` create a database (dir name == db name)
    - [x] `-n --name` database name (default: take from the path)
    - [ ] `-i --id XY` replica id (default: take from the path)
    - [x] `--oXxx="Yyy"` set a global database option Xxx to "Yyy"
    - [ ] `--OXxx="Yyy"` set a scoped database option 
    - [ ] `--0Xxx="Yyy"` set a local database option override
- [ ] `-F --fork` fork a database
    - [ ] `-t --to /path/dbname-YZ` a path for the new replica
    - [ ] `-i --id YZ` as above
- [x] `-A --access` access a database
    - [ ] `-s --scan /Type#id!prefix` list all records under a prefix
    - [x] `-e --erase /Type#id!prefix` erase records
    - [x] `-p --put file` add ops to the database (default: read stdin)
    - [x] `-v --vv` print the version vector
    - [ ] `-g --get /Type#id` print the object's state 
    - [ ] `--OXxx, --0Xxx` edit database options (as above)
- [x] `-U --user` add/remove/list users/clients
    - [x] `-a --add login` add a user (take the password from stdin)
    - [x] `-r --remove login`
    - [x] `-l --list`
- [ ] `-R --run` run a database (the default)
    - [ ] `-l --listen scheme:url` listen for client conns on URL
                (stdin `-`, WebSocket `ws://host:port`, TCP `tcp:...`)
    - [ ] `-c --connect scheme:url` connect to a peer
    - [ ] `-e --exec script.js` execute a script once connected
    - [ ] `-r --repl` start REPL
    - [ ] `-d --daemon` daemonize
    - [ ] `-x` exit when done
    - [ ] `-f --filter` grep log events (e.g. `-f /Swarm.on.off`)

## Database options

1. Globals (relayed to every replica)
    - [ ] `IdScheme` replica id scheme (e.g. `--oIdScheme=0280`)
    - [ ] `Clock` clock mode (`5`-`8`, `Logical`)
2. Scopeds (relayed to clients, but not peers)
3. Locals (not relayed)
    - [ ] `Listen` listen url (e.g. `-0Listen=wss://swarmdb.net:1234`)
    - [ ] `Connect` peer's url (e.g. `-0Connect=tcp://1.2.3.4:5678`)


for a CLI client, see `swarm-client`.
