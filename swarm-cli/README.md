# Swarm command-line client

A simple filesystem-backed Swarm client. Works more like a version control
system: saves data on the disk, pulls/pushes updates from/to the server.
Works offline, reconnects automatically.

## Usage

    swarm [options] dbdir/

## Options

- [ ] dbdir: replica's home path (default: .)
- [ ] `-C --connect url` connect to a server, init a replica
    - [ ] ws://1.2.3.4:5/dbid WebSocket
    - [ ] wss://1.2.3.4:5/dbid WebSocket (secure)
    - [ ] tcp://1.2.3.4:5/dbid TCP
- [ ] `-c --create type`
- [ ] `-g --get id` 
    - [ ] `-r --recur depth` recursive retrieval (default: depth 1)
- [ ] `-p --put id` commit a manually edited JSON object
- [ ] `-c --cat id`
- [ ] `-o --op id` feed an op (args or stdin must contain op name, value)
    - [ ] `-n --name` op name
    - [ ] `-v --value` op value
- [ ] `-e --edit` edit a JSON state, put when done (uses $EDITOR)
- [ ] `-u --update id` update (default: all the objects)
- [ ] `-l --log` list the log of pending ops (those not acked by the server)
- [ ] `-R --repl` run REPL
- [ ] `-T --trace` trace incoming/outgoing ops

## Examples

```bash
# install swarm client (see swarm-server on how to run a server)
$ npm i -g swarm-cli

# connect to the server, init the client
$ swarm -C tcp://gritzko:password@localhost:31415/testdb 

$ cd testdb/

# create an object
$ swarm --create LWWObject
/LWWObject#1GDBdW+Rgritzko01

# see the outer JSON state of the object
$ cat LWWObject/1GDBdW+Rgritzko01.json
{"_id":"1GDBdW+Rgritzko01","_version":"1GDBdW+Rgritzko01"}

# see the inner CRDT state (data+metadata)
$ cat LWWObject/.1GDBdW+Rgritzko01.~

# make a change to the object, see some client-server chit-chat
$ swarm --trace -o LWWObject/1GDBdW+Rgritzko01 -n FieldName -v FieldValue
...
< /LWWObject#1GDBdW+Rgritzko01!1GDBdk+Rgritzko01.FieldName FieldValue
> /LWWObject#1GDBdW+Rgritzko01!1GDBdk+Rgritzko01.FieldName FieldValue
...

# launch REPL, play with the JavaScript API
$ swarm --repl
≶ o = swarm.get('1GDBdW+Rgritzko01', obj => console.log(obj.get('FieldName')));
FieldValue
≶ o.set('FieldName', 'another value');
...
```