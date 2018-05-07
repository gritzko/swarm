# Swarm 2.0 real-time sync

> [![BuildStatus](https://travis-ci.org/gritzko/swarm.svg?branch=master)](https://travis-ci.org/gritzko/swarm)

![Mice](https://i.imgur.com/tv8EITG.gif)

Swarm.js is a JavaScript client for the Swarm database.
Swarm is like "git for data" except it's real-time and never has a merge conflict.
Swarm is based on [Replicated Object Notation][ron] (RON), a distributed live data format.
In turn, RON is based on [Conflict-free Replicated Data Types][crdt] (CRDTs), a new math apparatus for distributed data.

Like git, Swarm gives you a replica of your data which is as good as any other replica.
You can read, you can write, you can see it updated by others.
Concurrent changes merge automatically.
Offline replicas re-sync on re-connection.
All data is cached.

API-wise, Swarm is an object graph, although the API may depend on a particular mapper.
The ground truth is RON.

Swarm picks trade-offs in an opinionated way.
It fits the world of abundant storage and unreliable wireless connections.

Swarm.js is isomorphic and is perfect for implementing synchronization, collaboration or continuity features in Web and [mobile][react-native] apps.
Swarm works for:

* vanilla client-server sync,
* real-time collaboration,
* continuity,
* offline work,
* and other [sync-related scenarios][blog-UDA].

Unlike Firebase and others, you may run your own swarm server.
If you understand what [CRDT][crdt] is, then you may [implement][rdt] your own data types.
Free-as-in-freedom (MIT).

![Swarm: deployment](https://i.imgur.com/hqGwft1.png)

Click around our demos: [Mice](https://olebedev.github.io/mice)([source](https://github.com/olebedev/mice)) and Chat application([Chrome, Safari](https://olebedev.github.io/chat), [iOS](#), [Android](#))([source](https://github.com/olebedev/chat)).

## Table of contents:

* [Intro](#swarm-20-real-time-sync)
* [Setup](#setup)
* [CRDT implementations](#crdt-implementations)
* [API](#api)
* [GraphQL](#graphql)
* [Using with React](#using-with-react)
* [FAQ](#faq)
* [Contributing](#contributing)
* [Contacts](#contacts)

## Setup

Basic server implementation available as a docker image. First, please make sure that you have docker installed. Then create an initial config file.

```bash
$ cat > ./config.yaml <<EOF                                                                    
path: /var/lib/swarm
db:
  uuid: myapp$swarm
  swarming: Clients
  clock_mode: Calendar
  clock_len: 6
  fork_mode: FTrie
listen:
  url: ws://0.0.0.0:31415
  init: true
EOF
```

And run docker image:

```bash
$ docker run -d --name swarmdb -p 31415:31415 -v `pwd`:/var/lib/swarm olebedev/swarmdb
```

Now Swarm server is listening incoming connections on `ws://<container IP address>:31415` and we are ready to initiate connections onto it. Setup JavaScript project by running:

```bash
$ git clone git@github.com:gritzko/swarm.git
$ cd swarm
$ yarn
$ mkdir -p packages/examples/myapp
$ cd packages/examples/myapp
```

Now we can initialize a client instance and connect to running server.

```javascript
import gql from 'graphql-tag';
import SwarmDB from 'swarm-db';
import { LocalStorage } from 'swarm-client';

const swarm = new SwarmDB({
  storage: new LocalStorage(),
  upstream: 'ws://<container IP address>:31415',
  db: { name: 'myapp' }
});

// And then subscribe to live data.
const sub = gql`
  subscription ChatsList($from: Int = 0, $to: Int = 100, $uid: UUID!) {
    chats @node(id: "chats") {
      version
      length
      list: id @slice(begin: $from, end: $to) {
        title
        picture
        private
      }
    }
    user @node(id: $uid) {
      id
      version
      username
      avatar
    }
  }
`

const args = { from: 0, to: 20, uid: 'X8Kq%~github' }
swarm.execute({ gql: sub, args }, ({ data, error, off }) => {
  // handle updates 
  // or stop receiving updates via call `off()`
})
```

## CRDT implementations

* [x] [LWW](packages/rdt/lww.js), a last-write-wins replicated data type that may host a variety of user-land data types, like: a dictionary, a simple 1D array (no splice, no index shifts). This LWW employs client-side logical timestamps to decide which write wins, on a field-by-field basis. That is similar to e.g. Cassandra LWW.

* [x] [Set](packages/rdt/set.js), fully commutative, ordered(the last element has index `0`), with tombstones. You can either add or remove an atom. 

* [ ] [RGA](#), replicated growable array.
* [ ] [Counter](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#PN-Counter_(Positive-Negative_Counter)), positive-negative counter.

## API

#### `constructor(options: Options): SwarmDB`

Creates new Swarm instance. Gets metadata from the server if not presented locally, setup replica and writes meta into the storage asynchronously(also, see [`ensure()`](#ensure-promisevoid) method).  

Parameters:

* `options` - an object with properties:

	* `storage` - a storage interface implementation, required. There are tree implementations: [in-memory](https://github.com/gritzko/swarm/blob/master/packages/client/src/index.js#L29), [localStorage](https://github.com/gritzko/swarm/blob/master/packages/client/src/index.js#L29)(web) and [AsyncStorage](https://github.com/gritzko/swarm/blob/master/packages/client/src/asyncStorage.js#L7)(ReactNative).
	* `upstream` - a connection string, e.g. `'wss://the.host.com'`, required
	* `db` - an object, required
		* `name` - A database name, required
		* `auth` - a JWT, makes sense if auth mode enabled at the server, ignored otherwise

Example:

```javascript
const swarm = new SwarmDB({
  storage: new InMemory(),
  upstream: 'wss://example.com',
  db: { name: 'dbname' }
});
```

#### `execute(request: Request, cbk<T>: (Response<T>) => void ): Promise<{ ok: boolean, off: () => void }>`

Execute method is used to get data, operate with data using [GraphQL](http://graphql.org)([see below](#graphql)).

Parameters:

* `request` - an object with properties:
	*  `gql`  - GraphQL AST
	*  `args` - arguments for GraphQL statement
* `cbk` - a callback function which accepts `Response<T>` - object with properties:
	* `data` - `T`
	* `off` - a function which cancels a subscription, may be _undefined_ for mutations and static queries
	* `error` - an error if any

Example:

```javascript
const statement = gql`
subscription GetChats($from: Int!, $to: Int!) { 
  chats @node(id: "chats") { 
    length
    list: id @slice(begin: $from, end: $to) {
      title
    }
  } 
}`
const args = { from: 0, to: 20 }
swarm.execute({ gql: statements, args }, ({ data, error, off }) => {
  // handle updates 
  // or stop receiving updates via call `off()`
})

```

#### `close(): Promise<void>`

Returns a _Promise_ which will be resolved when the replica is closed(websocket closed and the state is written to the storage).

#### `ensure(): Promise<void>`

Returns a _Promise_ which will be resolved when the replica is initialized and ready to use. 

#### `open(): void`

(Re)Opens websocket connection to a database server.  

#### `uuid(): UUID`

Returns new UUID.

## GraphQL

Swarm operates with GraphQL on the client side. Communication between server and client occurs only in terms of RON protocol and atoms of data. No massive payloads only states and patches.

Swarm offers GraphQL as an interface to fetch and modify your data without pre-defined schemas(say, schema-less) since it doesn't support generics, with basic mutations operations for specific CRDTs, and with several additional directives(see below). It used to describe(declare) a resulting tree in GraphQL syntax. 

Key features:

* data (partial) reactivity
* operating with (sub)documents/(sub)collections as a first-class citizens
* all the CRDT nodes identifying via Swarm UUIDs by @node directive


### Basic primitives and conventions

`UUID` - is a [Swarm UUID](https://github.com/olebedev/swarm/blob/master/packages/ron-uuid/src/index.js#L6) or string representation of `UUID`.  

```graphql
scalar UUID
```

`Atom` - is a union of scalar types.  

```graphql
union Atom = String | Int | Float | Boolean | UUID
```

`Node` - is an interface of CRDT which presented as a key/value object where a value is a union of `Atom | Node | [Node]`. Internally, each objects JS prototype regardless its type has `id`, `type` and `version` fields. Additionally, the `set` type has `length` field, and `lww` type can also has `length` in case if all the user-land field keys are _numbers_(say, index of array). There are no native JavaScript arrays by default, they can be produced by directives(see below). 

```graphql
interface Node {
  id: String!
  type: String!
  version: String!
  length: Int # only for array-like objects
  # ... various of keys and values
}
```

`Payload` - is a flat key/value object. Where keys are strings and values are `Atom`s. 

```graphql
interface Payload {
  # ... various of keys and values
}
```

### Queries & Subscriptions

Both of these two root fields serve to declare the tree you intend to get as a result of the execution. There is nothing special except that you don't need to define schema.

Example. Let's subscribe to the last 100 users from the `users` collection.

```javascript
const statement = gql`
subscription Users($from: Int = 0, $to: Int = 100) { 
  users @node(id: "users") { 
    length
    list: id @slice(begin: $from, end: $to) {
      username
      picture
    }
  } 
}`

swarm.execute({ gql: statements }, ({ data, error, off }) => {
  // handle updates 
  console.log(data.users) // prints array of users
})
```
The difference between _subscription_ and _query_ is a data reactivity, see more details [here](#live--static).

### Mutations

Mutations are strictly defined and depend on CRDTs which are implemented. All of them listed below.

```graphql
type Mutation {
  # for LWW
  set(id: UUID!, payload: Payload!): Bool
  
  # for Set
  add(id: UUID!, value: Atom): Bool
  remove(id: UUID!, value: Atom): Bool
}
```

Note that an error will be raised in case of type mismatch.

Example. Suppose we have to add subdocument into user profile. For that we need to have an identifier(`UUID`) for new node, then we can put it into the parent document.

```javascript
// define mutation
const addSettings = gql`
  mutation AddSettings(
    $uid: UUID!, 
    $patch: Payload!, 
    $sid: UUID!, 
    $settings: Payload!
  ) {q
    patchUser: set($uid, $patch)
    createSettings: set($sid, $settings)
  }
`

// create a node ID
const sid = swarm.uuid();

// define arguments
const args = {
  uid: 'X8Kq%~github',
  patch: { settings: sid },
  settings: { premium: true },
  sid,
}

// run the mutation
await swarm.execute({ gql: addSettings, args }, resp => {
  console.log(resp.data) // will print { patchUser: true, createSettings: true }
})
// swarm.execute resolves Promise after all mutations were applied
```




### Directives

Here are the directives defined in Swarm GraphQL runtime, in addition to [default](http://graphql.org/learn/queries/#directives) ones. 

#### @node

```graphql
directive @node(id: UUID!) on FIELD
```

Used to define which node of Swarm graph should be unwrapped.
Can be missed if the field already contains a UUID itself(for nested objects). 

```graphql
directive @node(id: UUID!) on FIELD
# example
subscription {
  user @node(id: "X8Kq%~github") {
    version
    username
  }
  dashboard @node(id: "dash%~local") { # fetch locally presented node
    screen
    tasks @node(id: tasks) {
      length
      list: id @slice(begin: 0) {
        id
        title
        progress
      }
    }
  }
}
```


####  @live & @static

```graphql
directive @static on FIELD
directive @live on FIELD
```

Both add an ability to define a [partial reactivity](https://youtu.be/BSw05rJaCpA). All the nodes in the _subscription_ root field are reactive along with all the nodes in the _query_ root field are static. _Subscription_ and _query_ root field are interchangeable. So, it's up to developer which root field will be used, depends on how many nodes in a tree should be static or reactive. 

Once a static node was fetched from the server and cached it will be returned from the cache without network activity. 

```graphql
# fetch user once and cache for further queries
# and install subscription to notificatoins
subscription {
  user @node(id: "X8Kq%~github") @static {
    version
    username
    notifications @slice(begin: 0) {
      title
      read
    }
  }
}

# and the same example with query root field
query {
  user @node(id: "X8Kq%~github") {
    version
    username
    notifications @slice(begin: 0) @live {
      title
      read
    }
  }
}
```


#### @weak

```graphql
directive @weak on FIELD
```

Adds more control to data flow management. By default Swarm tries to fetch a node from the server if no presented in the local cache. So, _query_ or _subscription_ can block an application if there is no open connection. This directive tells the runtime to call back with `null`(don't wait for the server response) if the node is not presented in the local cache yet. Useful for offline work. 


```graphql
#example 
query {
  user @node(id: "X8Kq%~github") @live @weak {
    username
    version
  }
}
```

You can identify if the node doesn't exist in the system(the server) by checking `version` field. It contains `'0'`  in `version` field.

#### @slice & @reverse

```graphql
directive @slice(offset: Int!, limit: Int) on FIELD
directive @reverse on FIELD
```

These directives are for array-like objects/nodes. They work exactly like array methods in JavaScript. In fact, they call these methods.  But before calling the method the runtime tries to cast the object/node to an array via `Array.prototype.slice.call(node)`. 

For example, let's subscribe to nodes changes with UUID `messages`, meta data of the set(id, version, length) and the first message with an author.

```graphql
subscription {
  messages @node(id: "messages") {
    version
    length
    list: id @reverse @slice(begin: 0, end: 1) {
      id
      version
      text
      author {
        id
        username
        picture
      }
    }
  }
}
```

#### @date

```graphql
directive @date on FIELD
```
This directive casts the value into the _Date_ Javascript object, works only for Swarm UUID values or string representations. 

```graphql
# example
query {
  user @node(id: "X8Kq%~github") {
    lastTimeModified: version @date
    username
  }
}
```


> Notice. Priority of execution of directives from the first to the last.

## Using with [React](https://reactjs.org/)

The approach is the same as for Redux binding except that Swarm bindings use a render prop pattern instead of HOC. 

The workflow. You need to add Swarm into the context via `Provider` and then use `GraphQL` component for declarative updates fetching and mutatoins.

```javascript
import * as React from "react";
import ReactDOM from "react-dom";
import { Provider, GraphQL } from "swarm-react";
import { LocalStorage } from "swarm-client";

const swarm = new SwarmDB({
  storage: new LocalStorage(),
  upstream: "wss://example.com",
  db: { name: "example" }
});

class List extends React.Component {
  render() {
    <GraphQL>
      {({ data }) => {
        if (!data) return <span>loading...</span>;
        return <ul>{data.map(item => <li>{item.username}</li>)}</ul>;
      }}
    </GraphQL>;
  }
}

class App extends React.Component {
  render() {
    return (
      <Provider swarm={swarm}>
        <List />
      </Provider>
    );
  }
}

ReactDOM.render(<App />, document.getElementById("root"));
```

**GraphQL** component props:

## FAQ

> What is the state of the project?

The underlying layer - RON is stable and APIs are frozen. The client and the server are ready for building prototypes and kind of MVCs but not production ready yet. 

> How do I save collections of documents in Swarm?

Of course. For documents use `LWW` type and for collections use `Set` type.

Swarm is a JSON graph. Very much like in Firebase or MongoDB - document/collection-based approach. The key difference is you can put references into the graph, so, no need do denormalize your data and keep your data as flat as possible. Opposite to it, shape your data as deep as you want. 

> Why GraphQL?

It's a declarative paradigm approach. It allows shaping resulting data whatever you want, without additional transformations in user space. Also, it's a good fit too due to graph nature of Swarm data.

> Is this possible to keep application state in Swarm locally?

Sure. Use local UUIDs for nodes you don't want to send to server and sync between all the clients. Example:

```javascript
const dashboard = swarm.uuid().local() // a local uuid works only for the instance of the Swarm client. 
```

Note, you cannot refer local object from shared but can refer to shared objects from local ones. 

## Contributing

TODO

## Contacts

* Victor Grishchenko https://github.com/gritzko
* Oleg Lebedev https://github.com/olebedev

Follow Swarm on [twitter](https://twitter.com/swarmsync) and read our [blog](http://swarmdb.github.io/).



[ron]: http://github.com/gritzko/ron
[rdt]: https://github.com/gritzko/ron/tree/master/rdt
[react-native]: https://facebook.github.io/react-native/
[blog-UDA]: http://swarmdb.github.io/articles/uda/
[crdt]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type

[pacioli]: https://en.wikipedia.org/wiki/Bookkeeping#/media/File:Pacioli.jpg
[SST]: http://www.truthaboutdeath.com/blog/id/1591/the-authoritative-source-of-truth
[infocentric]: https://en.wikipedia.org/wiki/Information-centric_networking
[spec]: http://swarmdb.github.io/articles/lamport/
[apple-cassandra]: http://www.techrepublic.com/article/apples-secret-nosql-sauce-includes-a-hefty-dose-of-cassandra/
[semver]: http://semver.org/
[36]: https://github.com/gritzko/swarm/issues/36
